import { Pool } from 'pg';

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS entity_resolution JSONB;
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS framework_rate JSONB;
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS buyer_evidence JSONB;
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS supplier_evidence JSONB;
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS judge_result JSONB;
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS confidence_tier VARCHAR(20);
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS judge_flagged BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS schema_complete BOOLEAN;
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS case_output JSONB;
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS award_contract_value NUMERIC;
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS potential_rebate_lifetime_max NUMERIC;
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS evidence_source_references JSONB NOT NULL DEFAULT '[]'::jsonb;
      CREATE INDEX IF NOT EXISTS reconciliation_findings_confidence_idx
        ON reconciliation_findings(confidence_tier, judge_flagged);
    `);
    console.log('Cross-check evidence columns are ready.');
  } finally {
    await pool.end();
  }
}

migrate().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
