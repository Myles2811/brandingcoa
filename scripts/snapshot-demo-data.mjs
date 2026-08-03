/**
 * Snapshots the live reconciliation dataset into src/lib/demo/snapshot.json so the
 * liveDemoTue branch can run as a fully static build with no database.
 *
 * Usage: node --env-file=.env.local scripts/snapshot-demo-data.mjs
 *
 * The SQL below is copied verbatim from src/lib/reconciliation/findingsStore.ts so
 * the baked payloads are byte-for-byte what the API routes used to return.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, '../src/lib/demo/snapshot.json');

const NUMERIC_FINDING_FIELDS = [
  'expected_spend', 'reported_spend', 'expected_rebate', 'reported_rebate',
  'variance_amount', 'variance_percent', 'award_contract_value',
  'potential_rebate_lifetime_max',
];

function normaliseFinding(row) {
  const result = { ...row };
  for (const field of NUMERIC_FINDING_FIELDS) {
    const value = result[field];
    result[field] = value === null || value === undefined ? null : Number(value);
  }
  return result;
}

const OPPORTUNITY_REVIEW_SELECT = `
      COALESCE((
        SELECT jsonb_build_object(
          'opportunity_key', review.opportunity_key,
          'status', review.status,
          'due_now_rebate', review.due_now_rebate,
          'updated_by', review.updated_by,
          'last_action_at', review.last_action_at,
          'updated_at', review.updated_at,
          'notes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', note.id,
              'note', note.note,
              'author', note.author,
              'created_at', note.created_at
            ) ORDER BY note.created_at DESC)
            FROM reconciliation_opportunity_notes note
            WHERE note.opportunity_key = review.opportunity_key
          ), '[]'::jsonb)
        )
        FROM reconciliation_opportunity_reviews review
        WHERE review.opportunity_key = f.external_award_ids->>0
      ), jsonb_build_object(
        'opportunity_key', f.external_award_ids->>0,
        'status', 'new',
        'due_now_rebate', NULL,
        'updated_by', NULL,
        'last_action_at', NULL,
        'updated_at', NULL,
        'notes', '[]'::jsonb
      )) AS opportunity_review`;

const EXTERNAL_AWARDS_SELECT = `
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'candidate_id', c.candidate_id,
          'source', c.source,
          'buyer_name', c.buyer_name,
          'supplier_name', c.supplier_name,
          'contract_description', c.contract_description,
          'award_date', c.award_date,
          'publication_date', c.publication_date,
          'award_value', c.award_value,
          'currency', c.currency,
          'confidence', c.confidence,
          'framework_hints', COALESCE(c.framework_hints::jsonb, '[]'::jsonb),
          'source_url', c.link,
          'evidence_excerpt', c.evidence_excerpt
        ) ORDER BY c.created_at DESC)
        FROM jsonb_array_elements_text(f.external_award_ids) linked_awards(candidate_id)
        JOIN contracts c ON c.candidate_id = linked_awards.candidate_id
      ), '[]'::jsonb) AS external_awards`;

async function findingsForRun(pool, runId) {
  const result = await pool.query(`
    SELECT f.*,
      ${OPPORTUNITY_REVIEW_SELECT},
      ${EXTERNAL_AWARDS_SELECT}
    FROM reconciliation_findings f
    WHERE f.run_id = $1
    ORDER BY f.created_at DESC, f.id
    LIMIT 500 OFFSET 0
  `, [runId]);
  return result.rows.map(normaliseFinding);
}

async function findingsForMonth(pool, year, month) {
  const result = await pool.query(`
    WITH linked AS (
      SELECT f.id, linked_awards.candidate_id,
        row_number() OVER (PARTITION BY linked_awards.candidate_id ORDER BY f.created_at DESC, f.id DESC) AS rank
      FROM reconciliation_findings f
      CROSS JOIN LATERAL jsonb_array_elements_text(f.external_award_ids) linked_awards(candidate_id)
      JOIN contracts c ON c.candidate_id = linked_awards.candidate_id
      WHERE c.search_year = $1 AND c.search_month = $2
    ),
    selected_findings AS (
      SELECT DISTINCT id FROM linked WHERE rank = 1
    )
    SELECT f.*,
      ${OPPORTUNITY_REVIEW_SELECT},
      ${EXTERNAL_AWARDS_SELECT}
    FROM reconciliation_findings f
    JOIN selected_findings selected ON selected.id = f.id
    ORDER BY f.created_at DESC, f.id
  `, [year, month]);
  return result.rows.map(normaliseFinding);
}

/** Mirrors resolveDefaultDashboardMonth(), anchored to the snapshot date. */
async function defaultDashboardMonth(pool, anchor, minimumFindingCount = 10) {
  const previous = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 1));
  const result = await pool.query(`
    SELECT c.search_year, c.search_month, COUNT(DISTINCT f.id)::text AS findings
    FROM reconciliation_findings f
    CROSS JOIN LATERAL jsonb_array_elements_text(f.external_award_ids) linked_awards(candidate_id)
    JOIN contracts c ON c.candidate_id = linked_awards.candidate_id
    WHERE make_date(c.search_year, c.search_month, 1) <= make_date($1, $2, 1)
    GROUP BY c.search_year, c.search_month
    ORDER BY
      CASE WHEN COUNT(DISTINCT f.id) >= $3 THEN 0 ELSE 1 END,
      c.search_year DESC,
      c.search_month DESC
    LIMIT 1
  `, [previous.getUTCFullYear(), previous.getUTCMonth() + 1, minimumFindingCount]);
  const row = result.rows[0];
  if (row) return { year: row.search_year, month: row.search_month };
  return { year: previous.getUTCFullYear(), month: previous.getUTCMonth() + 1 };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to snapshot demo data');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const anchor = new Date();

  const runsResult = await pool.query(`
    SELECT * FROM reconciliation_runs
    WHERE operation = 'run' AND status IN ('completed', 'incomplete') AND finding_count > 0
    ORDER BY completed_at DESC NULLS LAST, created_at DESC
  `);
  const runs = runsResult.rows;
  if (!runs.length) throw new Error('No usable reconciliation runs found to snapshot');

  // The demo headlines the richest run so every table, chart and tab is populated.
  const richestRun = [...runs].sort((a, b) => b.finding_count - a.finding_count)[0];

  const runFindings = {};
  for (const run of runs) {
    runFindings[run.id] = await findingsForRun(pool, run.id);
    console.log(`run ${run.id} -> ${runFindings[run.id].length} findings`);
  }

  const monthsResult = await pool.query(`
    SELECT c.search_year AS year, c.search_month AS month, COUNT(DISTINCT f.id)::int AS findings
    FROM reconciliation_findings f
    CROSS JOIN LATERAL jsonb_array_elements_text(f.external_award_ids) linked_awards(candidate_id)
    JOIN contracts c ON c.candidate_id = linked_awards.candidate_id
    GROUP BY c.search_year, c.search_month
    ORDER BY 1 DESC, 2 DESC
  `);

  const monthFindings = {};
  for (const { year, month } of monthsResult.rows) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    monthFindings[key] = await findingsForMonth(pool, year, month);
    console.log(`month ${key} -> ${monthFindings[key].length} findings`);
  }

  const schedules = await pool.query('SELECT * FROM schedules ORDER BY id DESC LIMIT 50')
    .then(result => result.rows)
    .catch(() => []);

  const snapshot = {
    captured_at: anchor.toISOString(),
    default_month: await defaultDashboardMonth(pool, anchor),
    headline_run_id: richestRun.id,
    runs,
    run_findings: runFindings,
    months: monthsResult.rows,
    month_findings: monthFindings,
    schedules,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  await pool.end();

  console.log(`\nheadline run: ${richestRun.id} (${richestRun.finding_count} findings)`);
  console.log(`default month: ${snapshot.default_month.year}-${snapshot.default_month.month}`);
  console.log(`wrote ${outputPath}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
