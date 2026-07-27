import { PoolClient } from 'pg';
import { getPool } from '../db';
import { ValidationIssue } from './types';
import { ReconciliationGraphState } from './graph/state';
import { loadReconciliationSources } from './sourceStore';

export type ReconciliationOperation = 'sync' | 'run';
export type ReconciliationRunStatus = 'running' | 'completed' | 'incomplete' | 'failed';

export interface ReconciliationRunCounts {
  externalAwards?: number;
  frameworkRules?: number;
  rebateCheckRecords?: number;
  invoiceSpendRecords?: number;
}

export interface ReconciliationSnapshots {
  frameworkRules?: string | null;
  rebateCheckLog?: string | null;
  invoiceSpreadsheet?: string | null;
}

export async function createReconciliationRun(operation: ReconciliationOperation, runId = crypto.randomUUID()): Promise<string> {
  await getPool().query(
    `INSERT INTO reconciliation_runs (id, operation, status) VALUES ($1, $2, 'running')`,
    [runId, operation],
  );
  return runId;
}

async function updateRun(
  client: PoolClient,
  runId: string,
  status: Exclude<ReconciliationRunStatus, 'running'>,
  snapshots: ReconciliationSnapshots,
  counts: ReconciliationRunCounts,
  findingCount: number,
  issues: ValidationIssue[],
  error: string | null,
): Promise<void> {
  await client.query(`
    UPDATE reconciliation_runs SET
      status = $2,
      completed_at = CURRENT_TIMESTAMP,
      framework_rules_snapshot_id = $3,
      rebate_check_snapshot_id = $4,
      invoice_spreadsheet_snapshot_id = $5,
      external_award_count = $6,
      framework_rule_count = $7,
      rebate_check_record_count = $8,
      invoice_spend_record_count = $9,
      finding_count = $10,
      issues = $11::jsonb,
      error = $12
    WHERE id = $1
  `, [
    runId, status, snapshots.frameworkRules ?? null, snapshots.rebateCheckLog ?? null,
    snapshots.invoiceSpreadsheet ?? null, counts.externalAwards ?? 0, counts.frameworkRules ?? 0,
    counts.rebateCheckRecords ?? 0, counts.invoiceSpendRecords ?? 0, findingCount,
    JSON.stringify(issues), error,
  ]);
}

export async function completeSyncRun(
  runId: string,
  complete: boolean,
  snapshots: ReconciliationSnapshots,
  counts: ReconciliationRunCounts,
  issues: ValidationIssue[],
): Promise<void> {
  const client = await getPool().connect();
  try {
    await updateRun(client, runId, complete ? 'completed' : 'incomplete', snapshots, counts, 0, issues, null);
  } finally {
    client.release();
  }
}

export async function failReconciliationRun(runId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const client = await getPool().connect();
  try {
    await updateRun(client, runId, 'failed', {}, {}, 0, [], message);
  } finally {
    client.release();
  }
}

export async function persistCrossCheckFinding(state: ReconciliationGraphState): Promise<void> {
  if (!state.output || !state.finding) throw new Error('cross-check output is incomplete');
  const output = state.output;
  const evidenceScore = output.confidence_tier === 'HIGH' ? 100 : output.confidence_tier === 'MEDIUM' ? 75 : 50;
  const sources = await loadReconciliationSources(state.runId);
  const buyerIds = state.buyerEvidence ? sources.rebateChecks
    .filter(record => record.sourceWorksheet === state.buyerEvidence?.matched_tab &&
      `${record.sourceWorksheet} row ${record.sourceRow}` === state.buyerEvidence?.matched_row_reference)
    .map(record => record.id) : [];
  const supplierIds = state.supplierEvidence ? sources.invoiceSpend
    .filter(record => `${record.sourceWorksheet} row ${record.sourceRow}` === state.supplierEvidence?.matched_supplier_row)
    .map(record => record.id) : [];
  const id = `${state.runId}:${state.award.id}`;
  const supplierCanonical = output.supplier ?? state.award.supplierCanonical;
  const customerCanonical = output.organisation ?? state.award.customerCanonical;
  await getPool().query(`
    INSERT INTO reconciliation_findings (
      id, run_id, finding_code, framework_reference, supplier_canonical, customer_canonical,
      expected_rebate, deterministic_score, requires_review, explanation,
      external_award_ids, rebate_check_record_ids, invoice_spend_record_ids, framework_rule_ids,
      matched_on, conflicts, entity_resolution, framework_rate, buyer_evidence, supplier_evidence,
      judge_result, confidence_tier, judge_flagged, schema_complete, case_output,
      award_contract_value, potential_rebate_lifetime_max, evidence_source_references,
      identity_confirmed, organisation_display, supplier_display
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,
      $15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb,$21::jsonb,
      $22,$23,$24,$25::jsonb,$26,$27,$28::jsonb,$29,$30,$31
    )
    ON CONFLICT (id) DO UPDATE SET
      finding_code=EXCLUDED.finding_code, framework_reference=EXCLUDED.framework_reference,
      supplier_canonical=EXCLUDED.supplier_canonical, customer_canonical=EXCLUDED.customer_canonical,
      expected_rebate=EXCLUDED.expected_rebate, requires_review=EXCLUDED.requires_review,
      explanation=EXCLUDED.explanation, entity_resolution=EXCLUDED.entity_resolution,
      framework_rate=EXCLUDED.framework_rate, buyer_evidence=EXCLUDED.buyer_evidence,
      supplier_evidence=EXCLUDED.supplier_evidence, judge_result=EXCLUDED.judge_result,
      confidence_tier=EXCLUDED.confidence_tier, judge_flagged=EXCLUDED.judge_flagged,
      schema_complete=EXCLUDED.schema_complete, case_output=EXCLUDED.case_output,
      award_contract_value=EXCLUDED.award_contract_value,
      potential_rebate_lifetime_max=EXCLUDED.potential_rebate_lifetime_max,
      evidence_source_references=EXCLUDED.evidence_source_references,
      identity_confirmed=EXCLUDED.identity_confirmed,
      organisation_display=EXCLUDED.organisation_display,
      supplier_display=EXCLUDED.supplier_display
  `, [
    id, state.runId, output.finding_code, output.framework_ref, supplierCanonical, customerCanonical,
    output.potential_rebate_lifetime_max, evidenceScore,
    output.finding_code !== 'MATCHED' || output.judge_flagged, state.finding.reasoning_summary,
    JSON.stringify([state.award.id]), JSON.stringify(buyerIds), JSON.stringify(supplierIds),
    JSON.stringify([]), JSON.stringify(['langgraph_evidence_pipeline']), JSON.stringify(state.errors),
    JSON.stringify(null), JSON.stringify(state.frameworkRate), JSON.stringify(output.buyer_evidence),
    JSON.stringify(output.supplier_evidence), JSON.stringify(output.judge_result), output.confidence_tier,
    output.judge_flagged, output.schema_complete, JSON.stringify(output), output.award_contract_value,
    output.potential_rebate_lifetime_max, JSON.stringify(output.evidence_source_references),
    output.identity_confirmed, output.organisation, output.supplier,
  ]);
}

export async function completeCrossCheckRun(
  runId: string, findingCount: number, snapshots: ReconciliationSnapshots,
  counts: ReconciliationRunCounts, issues: ValidationIssue[] = [],
): Promise<void> {
  const client = await getPool().connect();
  try {
    await updateRun(client, runId, issues.some(issue => issue.fatal) ? 'incomplete' : 'completed', snapshots, counts, findingCount, issues, null);
  } finally {
    client.release();
  }
}
