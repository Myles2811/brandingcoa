import { Pool } from 'pg';

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reconciliation_opportunity_reviews (
      opportunity_key TEXT PRIMARY KEY,
      status VARCHAR(40) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'acknowledged', 'in_review', 'outreach_sent', 'resolved', 'not_relevant')),
      due_now_rebate NUMERIC,
      updated_by TEXT,
      last_action_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reconciliation_opportunity_notes (
      id TEXT PRIMARY KEY,
      opportunity_key TEXT NOT NULL REFERENCES reconciliation_opportunity_reviews(opportunity_key) ON DELETE CASCADE,
      note TEXT NOT NULL,
      author TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS reconciliation_opportunity_notes_lookup_idx
      ON reconciliation_opportunity_notes(opportunity_key, created_at DESC);
    CREATE INDEX IF NOT EXISTS reconciliation_opportunity_reviews_status_idx
      ON reconciliation_opportunity_reviews(status, updated_at DESC);
  `);
  await pool.end();
  console.log('Opportunity review tables are ready.');
}

run().catch(error => { console.error(error.message); process.exit(1); });
