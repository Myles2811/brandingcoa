import { Pool } from 'pg';

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reconciliation_run_sources (
        run_id TEXT PRIMARY KEY REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
        framework_rules JSONB NOT NULL,
        rebate_checks JSONB NOT NULL,
        invoice_spend JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Reconciliation run source snapshots are ready.');
  } finally {
    await pool.end();
  }
}

migrate().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
