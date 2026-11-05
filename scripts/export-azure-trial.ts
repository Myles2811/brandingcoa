/** Export private monthly-trial results after the runner has finished.
 * Only summary counters, detected public awards and validated case outputs are
 * included; model prompts, credentials and raw workbook rows stay outside.
 */
import { chmodSync, existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { ReconciliationCaseOutput } from '../src/lib/reconciliation/types';
import type { PSAwardResult } from '../src/lib/types';

interface UsageTotals {
  calls?: number;
  failed_calls?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  reasoning_tokens?: number;
  estimated_cost_usd?: number;
}

interface SourceStatus {
  source: string;
  count?: number;
  complete?: boolean;
  issues?: Array<{ stage?: string }>;
}

interface TrialSummary {
  generated_at: string;
  year: number;
  month: number;
  complete?: boolean;
  executed_stages_complete?: boolean;
  configured_sources_complete?: boolean;
  full_uk_coverage?: boolean;
  coverage_exclusions?: string[];
  source_statuses?: SourceStatus[];
  scanner?: UsageTotals & {
    raw_count?: number;
    candidate_count?: number;
    qualified_count?: number;
    stored_for_month?: number;
    rejected_count?: number;
  };
  reconciliation?: UsageTotals & {
    run_id?: string;
    as_of?: string;
    complete?: boolean;
    external_awards?: number;
    attempted_awards?: number;
    completed_awards?: number;
    judge_flagged?: number;
  };
  model_usage?: UsageTotals & { by_model?: Record<string, UsageTotals> };
  cost_unknown_outcome_calls?: number;
  cost_contains_upper_bound?: boolean;
  unallocated_estimated_cost_usd?: number;
  budget_usd?: number;
  failure?: string | null;
  limitations?: string[];
}

interface SavedReconciliation {
  run_id?: string;
  as_of?: string;
  states?: Array<{
    award?: { id?: string; currency?: string };
    frameworkRate?: { matched_row_reference?: string | null } | null;
    output?: ReconciliationCaseOutput | null;
  }>;
}

interface SavedScanner {
  year: number;
  month: number;
  finalResults: PSAwardResult[];
}

type Cell = string | number | boolean;
type Row = Record<string, Cell>;
class ExportError extends Error {}

function cell(value: unknown): Cell {
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value;
  // Excel cells cannot contain more than 32,767 characters.
  return typeof value === 'string' ? value.slice(0, 32_767) : '';
}

function textList(values: unknown): string {
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string').join('\n').slice(0, 32_767) : '';
}

function readObject(filename: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(readFileSync(filename, 'utf8')); }
  catch { throw new ExportError(`Unable to read valid JSON from ${path.basename(filename)}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ExportError(`Expected a JSON object in ${path.basename(filename)}`);
  return value as Record<string, unknown>;
}

function outputDirectory(): string {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 2 || arguments_[0] !== '--output' || !arguments_[1]) {
    throw new ExportError('Usage: export-azure-trial.ts --output data/azure-march-2026');
  }
  const output = path.resolve(arguments_[1]);
  const privateRoot = realpathSync(path.resolve('data'));
  const actual = realpathSync(output);
  if (!actual.startsWith(privateRoot + path.sep) || !statSync(actual).isDirectory()) {
    throw new ExportError('Trial output must be an existing directory inside the ignored data directory');
  }
  if (existsSync(path.join(actual, 'runner.lock'))) {
    throw new ExportError('The trial runner is still active or its lock needs review; export only after it has stopped');
  }
  return actual;
}

function sheet(rows: Row[], headers: string[], widths: number[]): XLSX.WorkSheet {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  worksheet['!cols'] = widths.map(wch => ({ wch }));
  if (worksheet['!ref']) worksheet['!autofilter'] = { ref: worksheet['!ref'] };
  return worksheet;
}

function main(): void {
  const output = outputDirectory();
  const summaryObject = readObject(path.join(output, 'summary.json'));
  if (!Number.isInteger(summaryObject.year) || !Number.isInteger(summaryObject.month) || typeof summaryObject.generated_at !== 'string') {
    throw new ExportError('The completed trial summary is missing its month or generated timestamp');
  }
  const summary = summaryObject as unknown as TrialSummary;
  const scannerFile = path.join(output, 'scanner-state.json');
  const scanner = existsSync(scannerFile) ? readObject(scannerFile) as unknown as SavedScanner : null;
  if (scanner && (scanner.year !== summary.year || scanner.month !== summary.month)) {
    throw new ExportError('Saved scanner results belong to a different month than the summary');
  }
  if (scanner && !Array.isArray(scanner.finalResults)) {
    throw new ExportError('Saved scanner results are missing their final detected-award list');
  }
  const detected = [...(scanner?.finalResults ?? [])];
  const expectedDetectedCount = summary.scanner?.qualified_count;
  if (typeof expectedDetectedCount === 'number' && detected.length !== expectedDetectedCount) {
    throw new ExportError('The detected-award count does not match the completed scanner summary');
  }
  detected.sort((left, right) => left.buyer_name.localeCompare(right.buyer_name, 'en-GB', { sensitivity: 'base' })
    || left.supplier_name.localeCompare(right.supplier_name, 'en-GB', { sensitivity: 'base' })
    || left.contract_description.localeCompare(right.contract_description, 'en-GB', { sensitivity: 'base' })
    || left.candidate_id.localeCompare(right.candidate_id));
  const detectedRows: Row[] = detected.map((award, index) => ({
    Number: index + 1,
    Status: 'Potential framework award; not a confirmed rebate match',
    Buyer: cell(award.buyer_name),
    Supplier: cell(award.supplier_name),
    Title: cell(award.contract_description),
    'Framework hints': textList(award.framework_hints),
    'Scanner confidence': cell(award.confidence),
    'Award value': cell(award.award_value),
    Currency: cell(award.currency),
    'Award date': cell(award.award_date),
    'Publication date': cell(award.publication_date),
    Source: cell(award.source),
    'Source link': cell(award.link),
    'Candidate ID': cell(award.candidate_id),
  }));
  const reconciliationFile = path.join(output, 'reconciliation-results.json');
  const reconciliation = existsSync(reconciliationFile)
    ? readObject(reconciliationFile) as unknown as SavedReconciliation
    : null;
  if (reconciliation?.run_id && summary.reconciliation?.run_id && reconciliation.run_id !== summary.reconciliation.run_id) {
    throw new ExportError('Saved reconciliation results belong to a different run than the summary');
  }
  const states = reconciliation?.states ?? [];
  const findings: Row[] = states.flatMap(state => {
    const value = state.output;
    if (!value) return [];
    return [{
      'Award ID': cell(state.award?.id),
      Organisation: cell(value.organisation),
      Supplier: cell(value.supplier),
      Framework: cell(value.framework_ref),
      'Award type': cell(value.award_type),
      Currency: cell(state.award?.currency),
      'Award contract value': cell(value.award_contract_value),
      'Potential rebate lifetime maximum': cell(value.potential_rebate_lifetime_max),
      Finding: cell(value.finding_code),
      Confidence: cell(value.confidence_tier),
      'Judge flagged': cell(value.judge_flagged),
      'Schema complete': cell(value.schema_complete),
      'Missing fields': textList(value.missing_fields),
      'Pipeline identity flag': cell(value.identity_confirmed),
      'Framework source reference': cell(state.frameworkRate?.matched_row_reference),
      'Buyer verdict': cell(value.buyer_evidence?.verdict),
      'Buyer tab': cell(value.buyer_evidence?.matched_tab),
      'Buyer row reference': cell(value.buyer_evidence?.matched_row_reference),
      'Supplier verdict': cell(value.supplier_evidence?.verdict),
      'Supplier tab': cell(value.supplier_evidence?.matched_tab),
      'Supplier row reference': cell(value.supplier_evidence?.matched_supplier_row),
      'Buyer evidence passed judge': cell(value.judge_result?.buyer_evidence_pass),
      'Supplier evidence passed judge': cell(value.judge_result?.supplier_evidence_pass),
      'Cross-evidence conflict': cell(value.judge_result?.cross_evidence_conflict),
      'Evidence source references': textList(value.evidence_source_references),
    }];
  });

  const sources = summary.source_statuses ?? [];
  const summaryRows: Row[] = [];
  const add = (field: string, value: unknown) => summaryRows.push({ Field: field, Value: cell(value) });
  add('Trial month', `${summary.year}-${String(summary.month).padStart(2, '0')}`);
  add('Summary generated at', summary.generated_at);
  add('Reconciliation run ID', summary.reconciliation?.run_id ?? reconciliation?.run_id);
  add('Reconciliation as-of', summary.reconciliation?.as_of ?? reconciliation?.as_of);
  add('Complete for configured sources', summary.complete);
  add('Executed workflow stages complete', summary.executed_stages_complete);
  add('Configured sources complete', summary.configured_sources_complete);
  add('Full UK coverage', summary.full_uk_coverage);
  add('Raw notices', summary.scanner?.raw_count);
  add('Deduplicated candidates', summary.scanner?.candidate_count);
  add('Qualified awards', summary.scanner?.qualified_count);
  add('Detected framework awards included in workbook', detectedRows.length);
  add('Awards stored for month', summary.scanner?.stored_for_month);
  add('Rejected candidates', summary.scanner?.rejected_count);
  add('Awards sent to reconciliation', summary.reconciliation?.external_awards);
  add('Awards attempted in reconciliation', summary.reconciliation?.attempted_awards);
  add('Completed reconciliation findings', summary.reconciliation?.completed_awards);
  add('Findings included in this workbook', findings.length);
  add('Reconciliation complete', summary.reconciliation?.complete);
  add('Judge-flagged findings', summary.reconciliation?.judge_flagged);
  add('Scanner estimated USD', summary.scanner?.estimated_cost_usd);
  add('Reconciliation estimated USD', summary.reconciliation?.estimated_cost_usd);
  add('Total estimated USD', summary.model_usage?.estimated_cost_usd);
  add('Unallocated estimated USD', summary.unallocated_estimated_cost_usd);
  add('Configured trial budget USD', summary.budget_usd);
  add('Unknown billing outcome calls', summary.cost_unknown_outcome_calls);
  add('Costs include conservative upper bounds', summary.cost_contains_upper_bound);
  add('Execution failure recorded', Boolean(summary.failure));
  add('Incomplete configured sources', sources.filter(source => !source.complete).map(source => source.source).join(', '));
  for (const [index, limitation] of (summary.coverage_exclusions ?? []).entries()) add(`Coverage exclusion ${index + 1}`, limitation);
  for (const [index, limitation] of (summary.limitations ?? []).entries()) add(`Run limitation ${index + 1}`, limitation);
  add('Interpretation', 'Findings are reviewable pipeline outputs, not approved financial results or independent identity verification.');
  add('DetectedAwards interpretation', 'These are potential framework awards selected by the scanner, not confirmed rebate matches.');
  add('Cost basis', 'Observed token counts priced at configured planning rates; not an Azure invoice.');
  if (!reconciliation) add('Export limitation', 'No saved reconciliation-results.json was available; the Findings sheet is empty.');

  const modelRows: Row[] = Object.entries(summary.model_usage?.by_model ?? {}).map(([model, usage]) => ({
    Model: model,
    Calls: cell(usage.calls),
    'Failed calls': cell(usage.failed_calls),
    'Fresh input tokens': cell(usage.input_tokens),
    'Cache-write input tokens': cell(usage.cache_creation_input_tokens),
    'Cache-read input tokens': cell(usage.cache_read_input_tokens),
    'Output tokens': cell(usage.output_tokens),
    'Reasoning tokens (included in output)': cell(usage.reasoning_tokens),
    'Estimated USD': cell(usage.estimated_cost_usd),
  }));
  const sourceRows: Row[] = sources.map(source => ({
    Source: cell(source.source),
    Notices: cell(source.count),
    Complete: cell(source.complete),
    Excluded: false,
    'Issue count': source.issues?.length ?? 0,
    'Issue stages': [...new Set((source.issues ?? []).map(issue => issue.stage).filter(Boolean))].join(', '),
    Note: source.complete ? '' : 'Coverage is incomplete; see private JSON artifacts for diagnostic details.',
  }));
  for (const exclusion of summary.coverage_exclusions ?? []) sourceRows.push({
    Source: 'Excluded source', Notices: 0, Complete: false, Excluded: true,
    'Issue count': 0, 'Issue stages': '', Note: cell(exclusion),
  });

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet(summaryRows, ['Field', 'Value'], [39, 115]), 'RunSummary');
  XLSX.utils.book_append_sheet(book, sheet(detectedRows, [
    'Number', 'Status', 'Buyer', 'Supplier', 'Title', 'Framework hints', 'Scanner confidence',
    'Award value', 'Currency', 'Award date', 'Publication date', 'Source', 'Source link', 'Candidate ID',
  ], [10, 62, 38, 38, 90, 25, 22, 20, 12, 24, 24, 27, 85, 75]), 'DetectedAwards');
  XLSX.utils.book_append_sheet(book, sheet(findings, [
    'Award ID', 'Organisation', 'Supplier', 'Framework', 'Award type', 'Currency',
    'Award contract value', 'Potential rebate lifetime maximum', 'Finding', 'Confidence',
    'Judge flagged', 'Schema complete', 'Missing fields', 'Pipeline identity flag',
    'Framework source reference', 'Buyer verdict', 'Buyer tab', 'Buyer row reference',
    'Supplier verdict', 'Supplier tab', 'Supplier row reference',
    'Buyer evidence passed judge', 'Supplier evidence passed judge',
    'Cross-evidence conflict', 'Evidence source references',
  ], [42, 35, 35, 18, 25, 12, 23, 32, 39, 14, 15, 17, 25, 23, 40, 23, 30, 40, 25, 30, 40, 25, 28, 24, 75]), 'Findings');
  XLSX.utils.book_append_sheet(book, sheet(modelRows, [
    'Model', 'Calls', 'Failed calls', 'Fresh input tokens', 'Cache-write input tokens',
    'Cache-read input tokens', 'Output tokens', 'Reasoning tokens (included in output)', 'Estimated USD',
  ], [23, 12, 16, 22, 26, 25, 20, 39, 21]), 'ModelUsage');
  XLSX.utils.book_append_sheet(book, sheet(sourceRows, [
    'Source', 'Notices', 'Complete', 'Excluded', 'Issue count', 'Issue stages', 'Note',
  ], [28, 15, 15, 15, 17, 25, 100]), 'SourceCoverage');
  const filename = path.join(output, 'trial-results.xlsx');
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true });
  writeFileSync(filename, buffer, { mode: 0o600 });
  chmodSync(filename, 0o600);
  console.log(`[Exporter] Wrote ${filename}; detected_awards=${detectedRows.length}; findings=${findings.length}; models=${modelRows.length}; source_rows=${sourceRows.length}.`);
}

try { main(); }
catch (error) {
  // Keep source errors and arbitrary data values out of console output.
  console.error(`[Exporter] ${error instanceof ExportError ? error.message : 'Export failed; verify that completed trial artifacts are readable'}`);
  process.exitCode = 1;
}
