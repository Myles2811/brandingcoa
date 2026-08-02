import { getPool } from '../db';
import { ensureOpportunityReviewTables } from './opportunityReviewStore';

export interface ReconciliationFindingFilters {
  findingCode?: string;
  confidenceTier?: 'HIGH' | 'MEDIUM' | 'LOW';
  organisation?: string;
  supplier?: string;
  limit: number;
  offset: number;
}

export interface ReconciliationRunRow {
  id: string;
  operation: 'sync' | 'run';
  status: 'running' | 'completed' | 'incomplete' | 'failed';
  created_at: Date;
  completed_at: Date | null;
  framework_rules_snapshot_id: string | null;
  rebate_check_snapshot_id: string | null;
  invoice_spreadsheet_snapshot_id: string | null;
  external_award_count: number;
  framework_rule_count: number;
  rebate_check_record_count: number;
  invoice_spend_record_count: number;
  finding_count: number;
  issues: unknown[];
  error: string | null;
}

type FindingRow = Record<string, unknown>;

const NUMERIC_FINDING_FIELDS = [
  'expected_spend', 'reported_spend', 'expected_rebate', 'reported_rebate',
  'variance_amount', 'variance_percent', 'award_contract_value',
  'potential_rebate_lifetime_max',
] as const;

function normaliseFinding(row: FindingRow): FindingRow {
  const result = { ...row };
  for (const field of NUMERIC_FINDING_FIELDS) {
    const value = result[field];
    result[field] = value === null || value === undefined ? null : Number(value);
  }
  return result;
}

function literalSubstring(value: string): string {
  return `%${value.replace(/[\\%_]/g, character => `\\${character}`)}%`;
}

export async function resolveReconciliationRun(runId?: string): Promise<ReconciliationRunRow | null> {
  const result = runId
    ? await getPool().query<ReconciliationRunRow>(
      `SELECT * FROM reconciliation_runs WHERE id = $1 AND operation = 'run'`,
      [runId],
    )
    : await getPool().query<ReconciliationRunRow>(`
      SELECT * FROM reconciliation_runs
      WHERE operation = 'run' AND status IN ('completed', 'incomplete') AND finding_count > 0
      ORDER BY completed_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `);
  return result.rows[0] ?? null;
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

export async function readReconciliationFindings(
  runId: string,
  filters: ReconciliationFindingFilters,
): Promise<{ findings: FindingRow[]; total: number }> {
  await ensureOpportunityReviewTables();
  const conditions = ['f.run_id = $1'];
  const values: unknown[] = [runId];

  const addCondition = (sql: string, value: unknown): void => {
    values.push(value);
    conditions.push(sql.replace('?', `$${values.length}`));
  };

  if (filters.findingCode) addCondition('f.finding_code = ?', filters.findingCode);
  if (filters.confidenceTier) addCondition('f.confidence_tier = ?', filters.confidenceTier);
  if (filters.organisation) {
    addCondition(
      `(COALESCE(f.organisation_display, '') ILIKE ? ESCAPE '\\'
        OR COALESCE(f.customer_canonical, '') ILIKE $${values.length + 1} ESCAPE '\\')`,
      literalSubstring(filters.organisation),
    );
  }
  if (filters.supplier) {
    addCondition(
      `(COALESCE(f.supplier_display, '') ILIKE ? ESCAPE '\\'
        OR COALESCE(f.supplier_canonical, '') ILIKE $${values.length + 1} ESCAPE '\\')`,
      literalSubstring(filters.supplier),
    );
  }

  const where = conditions.join(' AND ');
  const countResult = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM reconciliation_findings f WHERE ${where}`,
    values,
  );
  const pageValues = [...values, filters.limit, filters.offset];
  const findingsResult = await getPool().query<FindingRow>(`
    SELECT f.*,
      ${OPPORTUNITY_REVIEW_SELECT},
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
        FROM jsonb_array_elements_text(f.external_award_ids) linked(candidate_id)
        JOIN contracts c ON c.candidate_id = linked.candidate_id
      ), '[]'::jsonb) AS external_awards
    FROM reconciliation_findings f
    WHERE ${where}
    ORDER BY f.created_at DESC, f.id
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `, pageValues);

  return {
    findings: findingsResult.rows.map(normaliseFinding),
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

export async function readLatestReconciliationFindingsForMonth(
  year: number,
  month: number,
): Promise<{ findings: FindingRow[]; total: number }> {
  await ensureOpportunityReviewTables();
  const values = [year, month];
  const findingsResult = await getPool().query<FindingRow>(`
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
      ), '[]'::jsonb) AS external_awards
    FROM reconciliation_findings f
    JOIN selected_findings selected ON selected.id = f.id
    ORDER BY f.created_at DESC, f.id
  `, values);

  return {
    findings: findingsResult.rows.map(normaliseFinding),
    total: findingsResult.rows.length,
  };
}

export async function resolveDefaultDashboardMonth(
  anchor = new Date(),
  minimumFindingCount = 10,
): Promise<{ year: number; month: number }> {
  const previousCompleteMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 1));
  const result = await getPool().query<{ search_year: number; search_month: number; findings: string }>(`
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
  `, [
    previousCompleteMonth.getUTCFullYear(),
    previousCompleteMonth.getUTCMonth() + 1,
    minimumFindingCount,
  ]);

  const row = result.rows[0];
  if (row) return { year: row.search_year, month: row.search_month };
  return {
    year: previousCompleteMonth.getUTCFullYear(),
    month: previousCompleteMonth.getUTCMonth() + 1,
  };
}
