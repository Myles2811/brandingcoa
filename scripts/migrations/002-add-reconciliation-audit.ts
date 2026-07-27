import { Pool } from 'pg';

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reconciliation_runs (
        id TEXT PRIMARY KEY,
        operation VARCHAR(20) NOT NULL CHECK (operation IN ('sync', 'run')),
        status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'completed', 'incomplete', 'failed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMPTZ,
        framework_rules_snapshot_id TEXT,
        rebate_check_snapshot_id TEXT,
        invoice_spreadsheet_snapshot_id TEXT,
        external_award_count INTEGER NOT NULL DEFAULT 0,
        framework_rule_count INTEGER NOT NULL DEFAULT 0,
        rebate_check_record_count INTEGER NOT NULL DEFAULT 0,
        invoice_spend_record_count INTEGER NOT NULL DEFAULT 0,
        finding_count INTEGER NOT NULL DEFAULT 0,
        issues JSONB NOT NULL DEFAULT '[]'::jsonb,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS reconciliation_findings (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
        finding_code VARCHAR(80) NOT NULL,
        framework_reference TEXT,
        supplier_canonical TEXT,
        customer_canonical TEXT,
        expected_spend NUMERIC,
        reported_spend NUMERIC,
        expected_rebate NUMERIC,
        reported_rebate NUMERIC,
        variance_amount NUMERIC,
        variance_percent NUMERIC,
        due_date DATE,
        is_due BOOLEAN,
        deterministic_score INTEGER NOT NULL,
        requires_review BOOLEAN NOT NULL,
        explanation TEXT NOT NULL,
        external_award_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        rebate_check_record_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        invoice_spend_record_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        framework_rule_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        matched_on JSONB NOT NULL DEFAULT '[]'::jsonb,
        conflicts JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS reconciliation_runs_created_at_idx
        ON reconciliation_runs(created_at DESC);
      CREATE INDEX IF NOT EXISTS reconciliation_findings_run_id_idx
        ON reconciliation_findings(run_id);
      CREATE INDEX IF NOT EXISTS reconciliation_findings_code_review_idx
        ON reconciliation_findings(finding_code, requires_review);
      CREATE INDEX IF NOT EXISTS reconciliation_findings_case_lookup_idx
        ON reconciliation_findings(framework_reference, supplier_canonical, customer_canonical);
    `);
    console.log('Reconciliation audit tables are ready.');
  } finally {
    await pool.end();
  }
}

migrate().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
