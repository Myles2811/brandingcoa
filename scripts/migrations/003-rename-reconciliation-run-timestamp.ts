import { Pool } from 'pg';

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'reconciliation_runs' AND column_name = 'started_at'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'reconciliation_runs' AND column_name = 'created_at'
        ) THEN
          ALTER TABLE reconciliation_runs RENAME COLUMN started_at TO created_at;
        END IF;
      END $$;
      DROP INDEX IF EXISTS reconciliation_runs_started_at_idx;
      CREATE INDEX IF NOT EXISTS reconciliation_runs_created_at_idx ON reconciliation_runs(created_at DESC);
    `);
    console.log('Reconciliation run timestamp is exposed as created_at.');
  } finally {
    await pool.end();
  }
}

migrate().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
