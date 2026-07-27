import { getPool } from '../db';

export const OPPORTUNITY_REVIEW_STATUSES = [
  'new',
  'acknowledged',
  'in_review',
  'outreach_sent',
  'resolved',
  'not_relevant',
] as const;

export type OpportunityReviewStatus = typeof OPPORTUNITY_REVIEW_STATUSES[number];

export interface OpportunityReviewInput {
  opportunityKey: string;
  status?: OpportunityReviewStatus;
  note?: string;
  dueNowRebate?: number | null;
  updatedBy?: string;
}

let ensured = false;

export async function ensureOpportunityReviewTables(): Promise<void> {
  if (ensured) return;
  await getPool().query(`
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
  ensured = true;
}

export function isOpportunityReviewStatus(value: string): value is OpportunityReviewStatus {
  return OPPORTUNITY_REVIEW_STATUSES.includes(value as OpportunityReviewStatus);
}

export async function upsertOpportunityReview(input: OpportunityReviewInput): Promise<void> {
  await ensureOpportunityReviewTables();
  const status = input.status ?? 'new';
  const updatedBy = input.updatedBy?.trim() || 'dashboard';
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO reconciliation_opportunity_reviews (
        opportunity_key, status, due_now_rebate, updated_by, last_action_at, updated_at
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (opportunity_key) DO UPDATE SET
        status = EXCLUDED.status,
        due_now_rebate = COALESCE(EXCLUDED.due_now_rebate, reconciliation_opportunity_reviews.due_now_rebate),
        updated_by = EXCLUDED.updated_by,
        last_action_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `, [input.opportunityKey, status, input.dueNowRebate ?? null, updatedBy]);

    const note = input.note?.trim();
    if (note) {
      await client.query(`
        INSERT INTO reconciliation_opportunity_notes (id, opportunity_key, note, author)
        VALUES ($1, $2, $3, $4)
      `, [crypto.randomUUID(), input.opportunityKey, note.slice(0, 4000), updatedBy]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
