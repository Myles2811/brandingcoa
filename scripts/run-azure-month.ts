/** Private monthly trial of the original branding workflows. Public source coverage,
 * live workbook snapshots, model usage and run findings are recorded separately. */
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fetchNotices } from '../src/lib/graph/nodes/fetchNotices';
import { classifyAndFilter } from '../src/lib/graph/nodes/classifyAndFilter';
import { persistResults } from '../src/lib/graph/nodes/persistResults';
import type { PSAwardsState } from '../src/lib/graph/state';
import { getContractsByMonth, StoredContract } from '../src/lib/contractsStore';
import { closePool } from '../src/lib/db';
import { getModelCallRecords, isPermanentModelError, modelApiKey, restoreModelCallRecords, usingAzure } from '../src/lib/modelClient';
import type { ModelCallRecord } from '../src/lib/modelClient';
import { GraphClient } from '../src/lib/reconciliation/graph/client';
import { resolveGraphWorkbookConfig } from '../src/lib/reconciliation/graph/driveItems';
import { downloadWorkbook } from '../src/lib/reconciliation/graph/workbookDownloader';
import { getReconciliationGraph, ReconciliationGraphState } from '../src/lib/reconciliation/graph';
import { parseFrameworkRulesWorkbook } from '../src/lib/reconciliation/ingestion/frameworkRulesParser';
import { parseRebateCheckWorkbook } from '../src/lib/reconciliation/ingestion/rebateCheckParser';
import { parseInvoiceSpendWorkbook } from '../src/lib/reconciliation/ingestion/invoiceSpendParser';
import { canonicalOrganisation, canonicalSupplier, frameworkReference } from '../src/lib/reconciliation/validation/schemas';
import { createReconciliationRun, completeCrossCheckRun, failReconciliationRun } from '../src/lib/reconciliation/store';
import { saveReconciliationSources } from '../src/lib/reconciliation/sourceStore';
import { beginRunAudit, getRunAudit } from '../src/lib/reconciliation/graph/audit';
import type { ExternalAward, ReconciliationCaseOutput, ValidationIssue } from '../src/lib/reconciliation/types';

interface Options {
  year: number; month: number; output: string; budgetUsd: number;
  fetchOnly: boolean; reuseFetch: boolean; resumeReconciliation: boolean;
}

let activeLock: string | null = null;

function acquireLock(options: Options): void {
  mkdirSync(options.output, { recursive: true, mode: 0o700 });
  chmodSync(options.output, 0o700);
  const lock = path.join(options.output, 'runner.lock');
  let handle: number;
  try { handle = openSync(lock, 'wx', 0o600); }
  catch { throw new Error('A trial runner lock already exists in the output directory; verify the earlier process has stopped before removing it.'); }
  activeLock = lock;
  try { writeFileSync(handle, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() })); }
  finally { closeSync(handle); }
}

function releaseLock(): void {
  if (!activeLock) return;
  unlinkSync(activeLock);
  activeLock = null;
}

function parseOptions(): Options {
  const values = process.argv.slice(2);
  let year = 2026;
  let month = 3;
  let output = '';
  let budgetUsd = 15;
  let fetchOnly = false;
  let reuseFetch = false;
  let resumeReconciliation = false;
  for (let i = 0; i < values.length; i++) {
    const flag = values[i];
    if (flag === '--fetch-only') fetchOnly = true;
    else if (flag === '--reuse-fetch') reuseFetch = true;
    else if (flag === '--resume-reconciliation') resumeReconciliation = true;
    else if (['--year', '--month', '--output', '--budget-usd'].includes(flag)) {
      const value = values[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      if (flag === '--year') year = Number(value);
      else if (flag === '--month') month = Number(value);
      else if (flag === '--budget-usd') budgetUsd = Number(value);
      else output = value;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Invalid year');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Invalid month');
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error('Invalid budget');
  if (fetchOnly && (reuseFetch || resumeReconciliation)) throw new Error('--fetch-only cannot be combined with resume options');
  if (reuseFetch && resumeReconciliation) throw new Error('Choose either --reuse-fetch or --resume-reconciliation');
  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' }).toLowerCase();
  output = path.resolve(output || `data/azure-${monthName}-${year}`);
  const privateRoot = path.resolve('data');
  if (!output.startsWith(privateRoot + path.sep)) throw new Error('Trial output must be inside the ignored data directory');
  return { year, month, output, budgetUsd, fetchOnly, reuseFetch, resumeReconciliation };
}

function writePrivate(file: string, value: unknown): void {
  const directory = path.dirname(file);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
}

function safeError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const [name, value] of Object.entries(process.env)) {
    if (value && /KEY|TOKEN|SECRET|PASSWORD/.test(name)) message = message.replaceAll(value, '[REDACTED]');
  }
  return message;
}

function distribution(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

interface StageRecord {
  stage: 'scanner' | 'reconciliation'; started_at: string; completed_at: string | null;
  start_call_index: number; end_call_index: number | null; status: 'running' | 'completed' | 'failed' | 'interrupted';
}

function stageRecorder(options: Options) {
  const filename = path.join(options.output, 'stage-call-boundaries.json');
  const stages: StageRecord[] = existsSync(filename) ? JSON.parse(readFileSync(filename, 'utf8')) : [];
  for (const stage of stages) {
    if (stage.end_call_index === null) {
      stage.end_call_index = getModelCallRecords().length;
      stage.completed_at = new Date().toISOString();
      stage.status = 'interrupted';
    }
  }
  const save = () => writePrivate(filename, stages);
  save();
  return {
    stages,
    async run<T>(name: StageRecord['stage'], action: () => Promise<T>): Promise<T> {
      const stage: StageRecord = { stage: name, started_at: new Date().toISOString(), completed_at: null,
        start_call_index: getModelCallRecords().length, end_call_index: null, status: 'running' };
      stages.push(stage);
      save();
      try {
        const result = await action();
        stage.status = 'completed';
        return result;
      } catch (error) {
        stage.status = 'failed';
        throw error;
      } finally {
        stage.completed_at = new Date().toISOString();
        stage.end_call_index = getModelCallRecords().length;
        save();
      }
    },
  };
}

function usageSummary(records: ModelCallRecord[]) {
  const byModel: Record<string, {
    calls: number; failed_calls: number; input_tokens: number; output_tokens: number;
    cache_creation_input_tokens: number; cache_read_input_tokens: number;
    reasoning_tokens: number; estimated_cost_usd: number;
  }> = {};
  for (const record of records) {
    const total = byModel[record.model] ??= { calls: 0, failed_calls: 0, input_tokens: 0, output_tokens: 0,
      cache_creation_input_tokens: 0, cache_read_input_tokens: 0, reasoning_tokens: 0, estimated_cost_usd: 0 };
    total.calls++;
    total.failed_calls += record.error ? 1 : 0;
    total.input_tokens += record.usage?.input_tokens ?? 0;
    total.output_tokens += record.usage?.output_tokens ?? 0;
    total.cache_creation_input_tokens += record.usage?.cache_creation_input_tokens ?? 0;
    total.cache_read_input_tokens += record.usage?.cache_read_input_tokens ?? 0;
    total.reasoning_tokens += record.reasoning_tokens;
    total.estimated_cost_usd += record.estimated_cost_usd;
  }
  return { calls: records.length, failed_calls: records.filter(record => record.error).length,
    estimated_cost_usd: records.reduce((sum, record) => sum + record.estimated_cost_usd, 0), by_model: byModel };
}

function externalAward(contract: StoredContract): ExternalAward {
  return {
    id: contract.candidate_id, source: contract.source, ocid: contract.ocid || null,
    releaseId: contract.release_id, awardId: contract.award_id, lotIds: contract.lot_ids, contractIds: contract.contract_ids,
    customerRaw: contract.buyer_name, customerCanonical: canonicalOrganisation(contract.buyer_name),
    supplierRaw: contract.supplier_name, supplierCanonical: canonicalSupplier(contract.supplier_name),
    frameworkReferences: [...new Set(contract.framework_hints.map(frameworkReference).filter((value): value is string => !!value))],
    title: contract.contract_description, awardDate: contract.award_date || null, publicationDate: contract.publication_date,
    awardValue: contract.award_value === null ? null : String(contract.award_value), currency: contract.currency,
    confidence: contract.confidence, evidence: contract.evidence_excerpt, sourceUrl: contract.link,
  };
}

interface ReconciliationResult {
  run_id: string; as_of: string; complete: boolean; attempted_awards: number;
  external_awards: number; completed_awards: number; findings: ReconciliationCaseOutput[];
  issues: ValidationIssue[]; inputs: { framework_rules: number; rebate_checks: number; invoice_spend: number };
  workbook_snapshots: unknown;
}

async function runReconciliation(options: Options): Promise<ReconciliationResult> {
  const contracts = await getContractsByMonth(options.year, options.month);
  const awards = contracts.map(externalAward);
  const asOf = new Date(Date.UTC(options.year, options.month, 1) - 1).toISOString();
  const runId = await createReconciliationRun('run');
  beginRunAudit(runId);
  console.log(`[Runner] Reconciliation started: awards=${awards.length}; as_of=${asOf}; current SharePoint workbooks are retrospective inputs.`);
  try {
    const client = GraphClient.fromEnvironment();
    const { driveId, itemIds } = await resolveGraphWorkbookConfig(client);
    const [rulesFile, rebateFile, invoiceFile] = await Promise.all([
      downloadWorkbook(client, driveId, itemIds.frameworkRules),
      downloadWorkbook(client, driveId, itemIds.rebateCheckLog),
      downloadWorkbook(client, driveId, itemIds.invoiceSpreadsheet),
    ]);
    const frameworkRules = parseFrameworkRulesWorkbook(rulesFile.buffer, rulesFile.metadata);
    const rebateChecks = parseRebateCheckWorkbook(rebateFile.buffer, rebateFile.metadata);
    const invoiceSpend = parseInvoiceSpendWorkbook(invoiceFile.buffer, invoiceFile.metadata);
    const issues: ValidationIssue[] = [...frameworkRules.issues, ...rebateChecks.issues, ...invoiceSpend.issues];
    await saveReconciliationSources(runId, {
      frameworkRules: frameworkRules.records, rebateChecks: rebateChecks.records, invoiceSpend: invoiceSpend.records,
    });
    const snapshots = { frameworkRules: frameworkRules.metadata.snapshotId,
      rebateCheckLog: rebateChecks.metadata.snapshotId, invoiceSpreadsheet: invoiceSpend.metadata.snapshotId };
    const inputs = { framework_rules: frameworkRules.records.length,
      rebate_checks: rebateChecks.records.length, invoice_spend: invoiceSpend.records.length };
    const workbookSnapshots = { framework_rules: frameworkRules.metadata,
      rebate_check_log: rebateChecks.metadata, invoice_spreadsheet: invoiceSpend.metadata };
    writePrivate(path.join(options.output, 'workbook-snapshots.json'), workbookSnapshots);
    console.log(`[Runner] Workbooks parsed: rules=${inputs.framework_rules}; rebate_records=${inputs.rebate_checks}; spend_records=${inputs.invoice_spend}; issues=${issues.length}.`);
    // Fatal ingestion errors mean the source set is untrustworthy. Preserve the
    // validation evidence and fail before any reconciliation model request.
    if (issues.some(issue => issue.fatal)) {
      writePrivate(path.join(options.output, 'reconciliation-results.json'), {
        run_id: runId, as_of: asOf, states: [], inputs, issues,
      });
      throw new Error('Fatal workbook validation issues prevented reconciliation model calls; inspect private validation artifacts.');
    }
    const graph = await getReconciliationGraph();
    const states: ReconciliationGraphState[] = [];
    let attemptedAwards = 0;
    for (const award of awards) {
      attemptedAwards++;
      try {
        const state = await graph.invoke({
          runId, award, asOf, traceId: '', entityResolution: null, frameworkRate: null,
          buyerEvidence: null, supplierEvidence: null, judgeResult: null, finding: null, output: null,
          buyerAttempts: 0, supplierAttempts: 0, judgeFlagged: false, errors: [],
        }, { configurable: { thread_id: `${runId}:${award.id}` }, recursionLimit: 30 });
        states.push(state);
      } catch (error) {
        issues.push({ workbook: 'external_awards', code: 'CROSSCHECK_GRAPH_FAILED',
          message: `${award.id}: ${safeError(error)}`, fatal: true });
        const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : undefined;
        if (isPermanentModelError(error) || isPermanentModelError(cause)) {
          console.log(`[Runner] Reconciliation stopped after a permanent provider or budget failure at award ${attemptedAwards}/${awards.length}.`);
          break;
        }
      } finally {
        writePrivate(path.join(options.output, 'reconciliation-audit.json'), getRunAudit(runId));
        writePrivate(path.join(options.output, 'reconciliation-results.json'), { run_id: runId, as_of: asOf, states, issues });
      }
      console.log(`[Runner] Reconciliation progress=${attemptedAwards}/${awards.length}; completed=${states.length}.`);
    }
    if (attemptedAwards < awards.length) issues.push({ workbook: 'external_awards', code: 'AWARDS_NOT_ATTEMPTED',
      message: `${awards.length - attemptedAwards} awards were not attempted after a permanent failure.`, fatal: true });
    const findings = states.map(state => state.output).filter((output): output is ReconciliationCaseOutput => !!output);
    await completeCrossCheckRun(runId, findings.length, snapshots, {
      externalAwards: awards.length, frameworkRules: inputs.framework_rules,
      rebateCheckRecords: inputs.rebate_checks, invoiceSpendRecords: inputs.invoice_spend,
    }, issues);
    return { run_id: runId, as_of: asOf, complete: !issues.some(issue => issue.fatal) && findings.length === awards.length,
      attempted_awards: attemptedAwards, external_awards: awards.length, completed_awards: findings.length,
      findings, issues, inputs, workbook_snapshots: workbookSnapshots };
  } catch (error) {
    await failReconciliationRun(runId, safeError(error));
    writePrivate(path.join(options.output, 'reconciliation-audit.json'), getRunAudit(runId));
    throw error;
  }
}

function initialState(options: Options): PSAwardsState {
  return {
    year: options.year, month: options.month, frameworkId: null,
    useContractsFinderCrossCheck: true, allowFallbackScrape: false,
    strictMode: false, exclusionListText: '', apiKey: '', traceId: '', searchStartTime: Date.now(),
    storedCandidateIds: [], storedRealAwardKeys: [], rawNotices: [], candidates: [], rawCount: 0,
    sourceStatuses: [], issues: [], complete: true, classifiedResults: [], rejectedCandidates: [],
    usage: { input: 0, output: 0, cache_creation_input: 0, cache_read_input: 0, total: 0 },
    finalResults: [], persistedCount: 0, excludedCount: 0,
  };
}

async function loadFetchedState(options: Options): Promise<PSAwardsState> {
  const filename = path.join(options.output, 'source-fetch.json');
  if (options.reuseFetch) {
    if (!existsSync(filename)) throw new Error('Saved source-fetch.json was not found');
    const saved = JSON.parse(readFileSync(filename, 'utf8'));
    if (saved.year !== options.year || saved.month !== options.month) throw new Error('Saved fetch belongs to a different month');
    return { ...initialState(options), ...saved.state };
  }
  console.log(`[Runner] Fetching ${options.year}-${String(options.month).padStart(2, '0')} from Find a Tender, Scotland, Wales and Contracts Finder; Northern Ireland excluded.`);
  const fetched = await fetchNotices(initialState(options));
  writePrivate(filename, { year: options.year, month: options.month, fetched_at: new Date().toISOString(), state: fetched });
  console.log(`[Runner] Fetch saved: raw=${fetched.rawCount ?? 0}, candidates=${fetched.candidates?.length ?? 0}, complete=${fetched.complete ?? false}.`);
  for (const status of fetched.sourceStatuses ?? []) {
    console.log(`[Runner] Source=${status.source}; notices=${status.count}; complete=${status.complete}; issues=${status.issues.length}.`);
  }
  return { ...initialState(options), ...fetched };
}

async function main(): Promise<number> {
  const options = parseOptions();
  const database = new URL(process.env.DATABASE_URL ?? 'invalid:');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)) {
    throw new Error('The trial runner requires an explicitly configured loopback PostgreSQL database');
  }
  acquireLock(options);
  if (options.fetchOnly) {
    const state = await loadFetchedState(options);
    return state.complete ? 0 : 2;
  }
  if (!usingAzure()) throw new Error('Set AI_PROVIDER=azure_openai for this trial');
  modelApiKey();
  process.env.AI_MAX_COST_USD = String(options.budgetUsd);
  process.env.AI_USAGE_LEDGER = path.join(options.output, 'model-usage.jsonl');
  process.env.AI_LOG_USAGE = '1';
  restoreModelCallRecords(process.env.AI_USAGE_LEDGER);
  if (existsSync(process.env.AI_USAGE_LEDGER)) chmodSync(process.env.AI_USAGE_LEDGER, 0o600);
  const recorder = stageRecorder(options);
  const scanFilename = path.join(options.output, 'scanner-state.json');
  const fetchFilename = path.join(options.output, 'source-fetch.json');
  let state: PSAwardsState;
  let reconciliation: ReconciliationResult | null = null;
  let failure: string | null = null;
  if (options.resumeReconciliation) {
    if (existsSync(scanFilename)) {
      const saved = JSON.parse(readFileSync(scanFilename, 'utf8'));
      if (saved.year !== options.year || saved.month !== options.month) throw new Error('Saved scanner state belongs to a different month');
      state = { ...initialState(options), ...saved };
    } else if (existsSync(fetchFilename)) {
      const saved = JSON.parse(readFileSync(fetchFilename, 'utf8'));
      if (saved.year !== options.year || saved.month !== options.month) throw new Error('Saved source state belongs to a different month');
      state = { ...initialState(options), ...saved.state };
    } else throw new Error('Resuming reconciliation requires saved scanner/source metadata for coverage reporting');
    console.log('[Runner] Scanner skipped; reconciling only the requested month already stored in the trial database.');
  } else {
    state = await loadFetchedState(options);
  }
  try {
    if (!options.resumeReconciliation) {
      await recorder.run('scanner', async () => {
        state.apiKey = modelApiKey();
        state.searchStartTime = Date.now();
        console.log(`[Runner] Classifying all ${state.candidates.length} fetched candidates; configured-rate cumulative cap=$${options.budgetUsd.toFixed(2)}.`);
        state = { ...state, ...await classifyAndFilter(state) };
        state = { ...state, ...await persistResults(state) };
        // Credentials are supplied in memory only, and are never part of an artifact.
        const { apiKey: _apiKey, ...privateState } = state;
        void _apiKey;
        writePrivate(scanFilename, privateState);
        console.log(`[Runner] Scanner stored=${state.persistedCount}; qualified=${state.finalResults.length}; complete=${state.complete}.`);
      });
    }
    reconciliation = await recorder.run('reconciliation', () => runReconciliation(options));
  } catch (error) {
    failure = safeError(error);
    writePrivate(path.join(options.output, 'execution-failure.json'), { timestamp: new Date().toISOString(), error: failure });
    console.log('[Runner] Execution stopped; failure details and all recorded usage retained in private artifacts.');
  }
  const records = getModelCallRecords();
  const byStage = (stageName: StageRecord['stage']) => {
    const indexes = new Set<number>();
    for (const stage of recorder.stages.filter(stage => stage.stage === stageName)) {
      for (let i = stage.start_call_index; i < (stage.end_call_index ?? records.length); i++) indexes.add(i);
    }
    return usageSummary(records.filter((_record, index) => indexes.has(index)));
  };
  const stored = await getContractsByMonth(options.year, options.month);
  const scannerModelIssues = state.issues.filter(issue => issue.stage.startsWith('model_'));
  const configuredSourcesComplete = state.sourceStatuses.length === 4 && state.sourceStatuses.every(source => source.complete);
  const unknownOutcomeCalls = records.filter(record => 'usage_unknown' in record && record.usage_unknown);
  const executedStagesComplete = !failure && scannerModelIssues.length === 0 && !!reconciliation?.complete;
  const totalUsage = usageSummary(records);
  const scannerUsage = byStage('scanner');
  const reconciliationUsage = byStage('reconciliation');
  const summary = {
    generated_at: new Date().toISOString(), year: options.year, month: options.month,
    complete: executedStagesComplete && configuredSourcesComplete,
    executed_stages_complete: executedStagesComplete, configured_sources_complete: configuredSourcesComplete,
    full_uk_coverage: false,
    coverage_exclusions: ['eTendersNI/Northern Ireland was not fetched (fallback scrape disabled).'],
    source_statuses: state.sourceStatuses, scanner_issues: state.issues,
    scanner: { raw_count: state.rawCount, candidate_count: state.candidates.length,
      qualified_count: state.classifiedResults.length, stored_for_month: stored.length,
      rejected_count: state.rejectedCandidates.length, model_issues: scannerModelIssues.length,
      ...scannerUsage },
    reconciliation: reconciliation ? {
      run_id: reconciliation.run_id, complete: reconciliation.complete, as_of: reconciliation.as_of,
      external_awards: reconciliation.external_awards, attempted_awards: reconciliation.attempted_awards,
      completed_awards: reconciliation.completed_awards, inputs: reconciliation.inputs,
      finding_distribution: distribution(reconciliation.findings.map(finding => finding.finding_code)),
      confidence_distribution: distribution(reconciliation.findings.map(finding => finding.confidence_tier)),
      judge_flagged: reconciliation.findings.filter(finding => finding.judge_flagged).length,
      issues: reconciliation.issues, ...reconciliationUsage,
    } : { complete: false, ...reconciliationUsage },
    model_usage: totalUsage,
    cost_unknown_outcome_calls: unknownOutcomeCalls.length,
    cost_contains_upper_bound: records.some(record => 'cost_is_upper_bound' in record && record.cost_is_upper_bound),
    unallocated_estimated_cost_usd: totalUsage.estimated_cost_usd - scannerUsage.estimated_cost_usd - reconciliationUsage.estimated_cost_usd,
    budget_usd: options.budgetUsd, failure,
    limitations: [
      'Costs are estimates from observed tokens and configured planning rates, not an Azure invoice.',
      'Current SharePoint workbook snapshots are retrospective inputs; they are not proven to be the original March snapshots.',
      'No sampling or hidden candidate limit is applied; missing or failed source coverage is reported separately.',
      'The original demo dashboard and hosted schedules are not activated by this CLI trial.',
      'The retained structured-output node hardcodes identity_confirmed=true; this flag is not independent identity verification.',
      'Findings are reviewable workflow outputs, not finance-approved rebate entitlements or amounts.',
    ],
  };
  writePrivate(path.join(options.output, 'summary.json'), summary);
  const modelRows = Object.entries(totalUsage.by_model).map(([model, usage]) =>
    `| ${model} | ${usage.calls} | ${usage.failed_calls} | ${usage.input_tokens} | ${usage.output_tokens} | $${usage.estimated_cost_usd.toFixed(6)} |`).join('\n');
  const sourceRows = state.sourceStatuses.map(source => `| ${source.source} | ${source.count} | ${source.complete} | ${source.issues.length} |`).join('\n');
  writePrivate(path.join(options.output, 'summary.md'), `# Azure branding monthly trial — ${options.year}-${String(options.month).padStart(2, '0')}\n\n`
    + `Generated: ${summary.generated_at}\n\nComplete for configured sources: **${summary.complete}**. Workflow stages complete: **${executedStagesComplete}**. Full UK coverage: **false**.\n\n`
    + `Northern Ireland was excluded. Any incomplete source below also limits coverage. Current SharePoint workbooks are retrospective inputs; reconciliation as-of is ${reconciliation?.as_of ?? 'unavailable'}.\n\n`
    + `## Source coverage\n\n| Source | Notices | Complete | Issues |\n| --- | ---: | --- | ---: |\n${sourceRows}\n\n`
    + `## Pipeline\n\nRaw notices: ${state.rawCount}. Candidates: ${state.candidates.length}. Awards stored for this month: ${stored.length}. Reconciliation findings: ${reconciliation?.completed_awards ?? 0}/${reconciliation?.external_awards ?? stored.length}.\n\n`
    + `Scanner estimated cost: **$${scannerUsage.estimated_cost_usd.toFixed(6)}**. Reconciliation estimated cost: **$${reconciliationUsage.estimated_cost_usd.toFixed(6)}**. Cumulative trial estimated cost: **$${totalUsage.estimated_cost_usd.toFixed(6)}**. Configured cap: $${options.budgetUsd.toFixed(2)}.\n\n`
    + `## Model usage\n\n| Model | Calls | Failed calls | Fresh input tokens | Output tokens | Estimated USD |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${modelRows}\n\n`
    + `Unknown billing outcomes: ${unknownOutcomeCalls.length}. Cost includes conservative upper bounds: ${summary.cost_contains_upper_bound}.\n\n`
    + `These are configured-rate estimates, not an Azure invoice. Detailed findings, validation issues and model audit events remain in private JSON artifacts. No production schedule or dashboard was changed.\n\n`
    + `The retained structured-output node hardcodes identity_confirmed=true; this flag is not independent identity verification. Findings remain reviewable workflow outputs, not finance-approved rebate entitlements or amounts.\n`);
  console.log(`[Runner] Summary saved; workflow_complete=${executedStagesComplete}; sources_complete=${configuredSourcesComplete}; model_calls=${records.length}; estimated_total_usd=${totalUsage.estimated_cost_usd.toFixed(6)}.`);
  return summary.complete ? 0 : 2;
}

main().then(async code => {
  await closePool();
  releaseLock();
  process.exit(code);
}).catch(async error => {
  console.error(`[Runner] Failed: ${safeError(error)}`);
  await closePool().catch(() => undefined);
  releaseLock();
  process.exit(1);
});
