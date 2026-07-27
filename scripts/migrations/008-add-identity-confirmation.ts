import { Pool } from 'pg';

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS identity_confirmed BOOLEAN;
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS organisation_display TEXT;
      ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS supplier_display TEXT;
      CREATE INDEX IF NOT EXISTS reconciliation_findings_identity_confirmed_idx
        ON reconciliation_findings(identity_confirmed, finding_code);
    `);
    console.log('Identity confirmation fields are ready.');
  } finally { await pool.end(); }
}

migrate().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
