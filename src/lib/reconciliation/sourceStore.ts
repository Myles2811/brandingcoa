import { getPool } from '../db';
import { FrameworkRule, InvoiceSpendRecord, RebateCheckRecord } from './types';

export interface ReconciliationSources {
  frameworkRules: FrameworkRule[];
  rebateChecks: RebateCheckRecord[];
  invoiceSpend: InvoiceSpendRecord[];
}

const cache = new Map<string, ReconciliationSources>();

export async function saveReconciliationSources(runId: string, sources: ReconciliationSources): Promise<void> {
  await getPool().query(`
    INSERT INTO reconciliation_run_sources (run_id, framework_rules, rebate_checks, invoice_spend)
    VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb)
    ON CONFLICT (run_id) DO UPDATE SET framework_rules=EXCLUDED.framework_rules,
      rebate_checks=EXCLUDED.rebate_checks, invoice_spend=EXCLUDED.invoice_spend
  `, [runId, JSON.stringify(sources.frameworkRules), JSON.stringify(sources.rebateChecks), JSON.stringify(sources.invoiceSpend)]);
  cache.set(runId, sources);
}

export async function loadReconciliationSources(runId: string): Promise<ReconciliationSources> {
  const cached = cache.get(runId);
  if (cached) return cached;
  const result = await getPool().query<{
    framework_rules: FrameworkRule[]; rebate_checks: RebateCheckRecord[]; invoice_spend: InvoiceSpendRecord[];
  }>('SELECT framework_rules, rebate_checks, invoice_spend FROM reconciliation_run_sources WHERE run_id=$1', [runId]);
  const row = result.rows[0];
  if (!row) throw new Error(`reconciliation sources not found for run ${runId}`);
  const sources = { frameworkRules: row.framework_rules, rebateChecks: row.rebate_checks, invoiceSpend: row.invoice_spend };
  cache.set(runId, sources);
  return sources;
}
