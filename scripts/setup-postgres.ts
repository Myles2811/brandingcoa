import { Pool } from 'pg';

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contracts (
      id BIGSERIAL PRIMARY KEY, search_year INT NOT NULL, search_month INT NOT NULL,
      candidate_id TEXT UNIQUE, ocid TEXT, release_id TEXT, award_id TEXT,
      lot_ids TEXT DEFAULT '[]', contract_ids TEXT DEFAULT '[]',
      buyer_name VARCHAR(500), supplier_name VARCHAR(500), contract_description TEXT,
      award_date VARCHAR(50), publication_date VARCHAR(50), award_value DOUBLE PRECISION, currency VARCHAR(10),
      evidence_excerpt TEXT, confidence VARCHAR(20), link TEXT,
      framework_hints TEXT, first_seen_timestamp VARCHAR(50), source VARCHAR(100),
      real_award_key TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS schedules (
      id BIGSERIAL PRIMARY KEY, year INT NOT NULL, month INT NOT NULL,
      framework_id VARCHAR(100) DEFAULT '', use_contracts_finder BOOLEAN DEFAULT FALSE,
      strict_mode BOOLEAN DEFAULT FALSE, active BOOLEAN DEFAULT TRUE,
      last_run_at TIMESTAMPTZ, last_run_found INT DEFAULT 0, total_found INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ps_search_runs (
      id BIGSERIAL PRIMARY KEY, run_id TEXT NOT NULL UNIQUE, search_year INT NOT NULL,
      search_month INT NOT NULL, complete BOOLEAN NOT NULL, raw_count INT DEFAULT 0,
      candidate_count INT DEFAULT 0, qualified_count INT DEFAULT 0, excluded_count INT DEFAULT 0,
      input_tokens BIGINT DEFAULT 0, output_tokens BIGINT DEFAULT 0,
      cache_creation_input_tokens BIGINT DEFAULT 0, cache_read_input_tokens BIGINT DEFAULT 0,
      issues TEXT DEFAULT '[]', source_statuses TEXT DEFAULT '[]', model VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
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
      framework_reference TEXT, supplier_canonical TEXT, customer_canonical TEXT,
      expected_spend NUMERIC, reported_spend NUMERIC,
      expected_rebate NUMERIC, reported_rebate NUMERIC,
      variance_amount NUMERIC, variance_percent NUMERIC,
      due_date DATE, is_due BOOLEAN,
      deterministic_score INTEGER NOT NULL, requires_review BOOLEAN NOT NULL,
      explanation TEXT NOT NULL,
      external_award_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      rebate_check_record_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      invoice_spend_record_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      framework_rule_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      matched_on JSONB NOT NULL DEFAULT '[]'::jsonb,
      conflicts JSONB NOT NULL DEFAULT '[]'::jsonb,
      entity_resolution JSONB,
      framework_rate JSONB,
      buyer_evidence JSONB,
      supplier_evidence JSONB,
      judge_result JSONB,
      confidence_tier VARCHAR(20),
      judge_flagged BOOLEAN NOT NULL DEFAULT FALSE,
      schema_complete BOOLEAN,
      case_output JSONB,
      award_contract_value NUMERIC,
      potential_rebate_lifetime_max NUMERIC,
      evidence_source_references JSONB NOT NULL DEFAULT '[]'::jsonb,
      identity_confirmed BOOLEAN,
      organisation_display TEXT,
      supplier_display TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS reconciliation_runs_created_at_idx ON reconciliation_runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS reconciliation_findings_run_id_idx ON reconciliation_findings(run_id);
    CREATE INDEX IF NOT EXISTS reconciliation_findings_code_review_idx ON reconciliation_findings(finding_code, requires_review);
    CREATE INDEX IF NOT EXISTS reconciliation_findings_case_lookup_idx ON reconciliation_findings(framework_reference, supplier_canonical, customer_canonical);
    CREATE TABLE IF NOT EXISTS reconciliation_entity_embeddings (
      entity_type VARCHAR(30) NOT NULL,
      canonical_value TEXT NOT NULL,
      embedding DOUBLE PRECISION[] NOT NULL,
      embedding_model VARCHAR(100) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (entity_type, canonical_value)
    );
    CREATE TABLE IF NOT EXISTS reconciliation_run_sources (
      run_id TEXT PRIMARY KEY REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
      framework_rules JSONB NOT NULL,
      rebate_checks JSONB NOT NULL,
      invoice_spend JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
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
  await pool.query('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS publication_date VARCHAR(50)');
  await pool.query(`
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS candidate_id TEXT;
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS ocid TEXT;
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS release_id TEXT;
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS award_id TEXT;
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS lot_ids TEXT DEFAULT '[]';
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_ids TEXT DEFAULT '[]';
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS real_award_key TEXT;
    ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_link_key;
    UPDATE contracts SET candidate_id = 'legacy:' || id WHERE candidate_id IS NULL OR candidate_id = '';
    CREATE UNIQUE INDEX IF NOT EXISTS contracts_candidate_id_key ON contracts(candidate_id);
  `);
  await pool.end();
  console.log('PostgreSQL tables are ready.');
}

run().catch(error => { console.error(error.message); process.exit(1); });
