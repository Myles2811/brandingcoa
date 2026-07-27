export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 900;

import { NextRequest, NextResponse } from 'next/server';
import { getAllContracts } from '@/lib/contractsStore';
import { getLangfuse } from '@/lib/langfuseClient';
import { reconciliationAuthError } from '@/lib/reconciliation/auth';
import { GraphClient } from '@/lib/reconciliation/graph/client';
import { resolveGraphWorkbookConfig } from '@/lib/reconciliation/graph/driveItems';
import { getReconciliationGraph, ReconciliationGraphState } from '@/lib/reconciliation/graph';
import { downloadWorkbook } from '@/lib/reconciliation/graph/workbookDownloader';
import { parseFrameworkRulesWorkbook } from '@/lib/reconciliation/ingestion/frameworkRulesParser';
import { parseRebateCheckWorkbook } from '@/lib/reconciliation/ingestion/rebateCheckParser';
import { parseInvoiceSpendWorkbook } from '@/lib/reconciliation/ingestion/invoiceSpendParser';
import { completeCrossCheckRun, createReconciliationRun, failReconciliationRun } from '@/lib/reconciliation/store';
import { ExternalAward, ReconciliationCaseOutput, ReconciliationFinding, ValidationIssue } from '@/lib/reconciliation/types';
import { canonicalOrganisation, canonicalSupplier, frameworkReference } from '@/lib/reconciliation/validation/schemas';
import { saveReconciliationSources } from '@/lib/reconciliation/sourceStore';
import { auditUsage, beginRunAudit, getRunAudit } from '@/lib/reconciliation/graph/audit';

interface RunRequest { as_of?: string; external_award_ids?: string[] }

function distribution<T extends string>(values: T[]): Record<T, number> {
  return values.reduce((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {} as Record<T, number>);
}

export async function POST(request: NextRequest) {
  const authError = reconciliationAuthError(request);
  if (authError) return authError;
  let body: RunRequest = {};
  try { body = await request.json(); } catch { /* optional body */ }
  let runId: string | null = null;
  const langfuse = getLangfuse();
  const trace = langfuse.trace({ name: 'reconciliation-crosscheck', metadata: { requested_awards: body.external_award_ids?.length ?? 'all' } });
  try {
    runId = await createReconciliationRun('run');
    beginRunAudit(runId);
    const client = GraphClient.fromEnvironment();
    const { driveId, itemIds } = await resolveGraphWorkbookConfig(client);
    const [rulesFile, rebateFile, invoiceFile, contracts] = await Promise.all([
      downloadWorkbook(client, driveId, itemIds.frameworkRules),
      downloadWorkbook(client, driveId, itemIds.rebateCheckLog),
      downloadWorkbook(client, driveId, itemIds.invoiceSpreadsheet),
      getAllContracts(),
    ]);
    const frameworkRules = parseFrameworkRulesWorkbook(rulesFile.buffer, rulesFile.metadata);
    const rebateChecks = parseRebateCheckWorkbook(rebateFile.buffer, rebateFile.metadata);
    const invoiceSpend = parseInvoiceSpendWorkbook(invoiceFile.buffer, invoiceFile.metadata);
    const filterIds = body.external_award_ids?.length ? new Set(body.external_award_ids) : null;
    const externalAwards: ExternalAward[] = contracts.filter(contract => !filterIds || filterIds.has(contract.candidate_id)).map(contract => ({
      id: contract.candidate_id, source: contract.source, ocid: contract.ocid || null,
      releaseId: contract.release_id, awardId: contract.award_id, lotIds: contract.lot_ids,
      contractIds: contract.contract_ids, customerRaw: contract.buyer_name,
      customerCanonical: canonicalOrganisation(contract.buyer_name), supplierRaw: contract.supplier_name,
      supplierCanonical: canonicalSupplier(contract.supplier_name),
      frameworkReferences: [...new Set(contract.framework_hints.map(frameworkReference).filter((value): value is string => !!value))],
      title: contract.contract_description, awardDate: contract.award_date || null,
      publicationDate: contract.publication_date, awardValue: contract.award_value === null ? null : String(contract.award_value),
      currency: contract.currency, confidence: contract.confidence, evidence: contract.evidence_excerpt, sourceUrl: contract.link,
    }));
    const sourceIssues = [...frameworkRules.issues, ...rebateChecks.issues, ...invoiceSpend.issues];
    await saveReconciliationSources(runId, {
      frameworkRules: frameworkRules.records, rebateChecks: rebateChecks.records, invoiceSpend: invoiceSpend.records,
    });
    const graph = await getReconciliationGraph();
    const states: ReconciliationGraphState[] = [];
    const graphIssues: ValidationIssue[] = [];
    for (const award of externalAwards) {
      try {
        const state = await graph.invoke({
          runId, award, asOf: body.as_of ?? new Date().toISOString(), traceId: trace.id,
          entityResolution: null, frameworkRate: null, buyerEvidence: null, supplierEvidence: null,
          judgeResult: null, finding: null, output: null, buyerAttempts: 0, supplierAttempts: 0,
          judgeFlagged: false, errors: [],
        }, { configurable: { thread_id: `${runId}:${award.id}` }, recursionLimit: 30 });
        states.push(state);
      } catch (error) {
        graphIssues.push({ workbook: 'external_awards', code: 'CROSSCHECK_GRAPH_FAILED',
          message: `${award.id}: ${error instanceof Error ? error.message : String(error)}`, fatal: true });
      }
    }
    const allIssues = [...sourceIssues, ...graphIssues];
    const outputs = states.map(state => state.output).filter((output): output is ReconciliationCaseOutput => !!output);
    await completeCrossCheckRun(runId, outputs.length, {
      frameworkRules: frameworkRules.metadata.snapshotId, rebateCheckLog: rebateChecks.metadata.snapshotId,
      invoiceSpreadsheet: invoiceSpend.metadata.snapshotId,
    }, { externalAwards: externalAwards.length, frameworkRules: frameworkRules.records.length,
      rebateCheckRecords: rebateChecks.records.length, invoiceSpendRecords: invoiceSpend.records.length }, allIssues);
    const findingDistribution = distribution(outputs.map(output => output.finding_code));
    const confidenceDistribution = distribution(outputs.map(output => output.confidence_tier));
    const judgeFlaggedCount = outputs.filter(output => output.judge_flagged).length;
    const audit = getRunAudit(runId);
    const usage = auditUsage(audit);
    const usageByModel = Object.fromEntries([...new Set(audit.flatMap(event => event.model ? [event.model] : []))].map(model => [
      model, auditUsage(audit.filter(event => event.model === model)),
    ]));
    trace.update({ output: { run_id: runId, findings: findingDistribution, confidence: confidenceDistribution,
      judge_flagged: judgeFlaggedCount, failures: graphIssues.length } });
    return NextResponse.json({
      runId, complete: !allIssues.some(issue => issue.fatal),
      summary: findingDistribution as Partial<Record<ReconciliationFinding, number>>,
      confidence_distribution: confidenceDistribution,
      judge_flagged: judgeFlaggedCount, issues: allIssues,
      usage, usage_by_model: usageByModel, audit,
      inputs: { external_awards: externalAwards.length, framework_rules: frameworkRules.records.length,
        rebate_check_records: rebateChecks.records.length, invoice_spend_records: invoiceSpend.records.length },
      results: states.map(state => ({ output: state.output, entity_resolution: state.entityResolution,
        framework_rate: state.frameworkRate, buyer_evidence: state.buyerEvidence,
        supplier_evidence: state.supplierEvidence, judge_result: state.judgeResult,
        judge_flagged: state.judgeFlagged, errors: state.errors })),
    }, { status: allIssues.some(issue => issue.fatal) ? 206 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (runId) await failReconciliationRun(runId, error).catch(persistError => console.error('[Crosscheck] Failed to persist failure:', persistError));
    trace.update({ output: { error: error instanceof Error ? error.message : String(error) } });
    return NextResponse.json({ complete: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  } finally {
    await langfuse.flushAsync();
  }
}
