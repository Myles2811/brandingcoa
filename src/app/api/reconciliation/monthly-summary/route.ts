export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { frameworkStatusAt, getFramework } from '@/lib/frameworkCatalogue';

type CategoryKey = 'supplier_side_issue' | 'buyer_side_issue' | 'both_sides_missing' | 'needs_review' | 'on_track' | 'framework_not_confirmed';

interface SummaryRow {
  candidate_id: string;
  finding_code: string;
  confidence_tier: string | null;
  framework_reference: string | null;
  framework_hints: string[] | null;
  award_date: string | null;
  publication_date: string | null;
  award_value: string | number | null;
  rebate_value: string | number | null;
  buyer_evidence: Record<string, unknown> | null;
  supplier_evidence: Record<string, unknown> | null;
}

function numeric(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function verdict(evidence: Record<string, unknown> | null): string | null {
  return typeof evidence?.verdict === 'string' ? evidence.verdict : null;
}

function categoryFor(row: SummaryRow): CategoryKey {
  if (!frameworkConfirmed(row)) return 'framework_not_confirmed';
  const buyer = verdict(row.buyer_evidence);
  const supplier = verdict(row.supplier_evidence);
  if (row.finding_code === 'MATCHED' || row.finding_code === 'NOT_YET_DUE') return 'on_track';
  if (buyer === 'COA_CONFIRMED' && ['MISSING_FOR_DUE_PERIOD', 'NO_CYCLE_DEFINED', 'OFF_CYCLE'].includes(supplier ?? '')) {
    return 'supplier_side_issue';
  }
  if (['NO_RECORD', 'CAA_ONLY', null].includes(buyer) && ['ON_SCHEDULE', 'OFF_CYCLE'].includes(supplier ?? '')) {
    return 'buyer_side_issue';
  }
  if (['NO_RECORD', null].includes(buyer) && ['NO_CYCLE_DEFINED', 'MISSING_FOR_DUE_PERIOD', null].includes(supplier)) {
    return 'both_sides_missing';
  }
  return 'needs_review';
}

function frameworkConfirmed(row: SummaryRow): boolean {
  const references = [
    row.framework_reference,
    ...(Array.isArray(row.framework_hints) ? row.framework_hints : []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const evidenceDate = row.award_date || row.publication_date || new Date().toISOString();
  return [...new Set(references.map(value => value.trim().toUpperCase()))].some(reference => {
    const framework = getFramework(reference);
    if (!framework) return false;
    const status = frameworkStatusAt(framework, evidenceDate);
    return status === 'active' || status === 'expiring';
  });
}

function emptyCategory(label: string) {
  return { label, count: 0, award_value: 0, rebate_value: 0 };
}

function boundedMonth(value: string | null): number | null {
  if (!value || !/^\d{1,2}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= 12 ? parsed : null;
}

function boundedYear(value: string | null): number | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 2020 && parsed <= 2100 ? parsed : null;
}

export async function GET(request: NextRequest) {
  const year = boundedYear(request.nextUrl.searchParams.get('year'));
  const month = boundedMonth(request.nextUrl.searchParams.get('month'));
  if (!year || !month) return NextResponse.json({ error: 'Provide a valid year and month.' }, { status: 400 });

  const pool = getPool();
  const [storedResult, findingsResult] = await Promise.all([
    pool.query<{ count: string; award_value: string | null }>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(award_value), 0)::text AS award_value
       FROM contracts WHERE search_year = $1 AND search_month = $2`,
      [year, month],
    ),
    pool.query<SummaryRow>(`
      WITH linked AS (
        SELECT
          f.finding_code,
          f.confidence_tier,
          f.framework_reference,
          f.buyer_evidence,
          f.supplier_evidence,
          f.potential_rebate_lifetime_max AS rebate_value,
          COALESCE(f.award_contract_value, c.award_value) AS award_value,
          COALESCE(c.framework_hints::jsonb, '[]'::jsonb) AS framework_hints,
          NULLIF(c.award_date, '') AS award_date,
          NULLIF(c.publication_date, '') AS publication_date,
          linked_awards.candidate_id,
          row_number() OVER (
            PARTITION BY linked_awards.candidate_id
            ORDER BY f.created_at DESC, f.id DESC
          ) AS rank
        FROM reconciliation_findings f
        CROSS JOIN LATERAL jsonb_array_elements_text(f.external_award_ids) linked_awards(candidate_id)
        JOIN contracts c ON c.candidate_id = linked_awards.candidate_id
        WHERE c.search_year = $1 AND c.search_month = $2
      )
      SELECT candidate_id, finding_code, confidence_tier, framework_reference, framework_hints,
        award_date, publication_date, buyer_evidence, supplier_evidence, award_value, rebate_value
      FROM linked
      WHERE rank = 1
    `, [year, month]),
  ]);

  const categories: Record<CategoryKey, ReturnType<typeof emptyCategory>> = {
    supplier_side_issue: emptyCategory('Supplier-side issue'),
    buyer_side_issue: emptyCategory('Buyer-side issue'),
    both_sides_missing: emptyCategory('Buyer + supplier missing'),
    needs_review: emptyCategory('Needs review'),
    on_track: emptyCategory('On track'),
    framework_not_confirmed: emptyCategory('Framework not confirmed'),
  };
  const confidence: Record<string, number> = {};
  const findingCodes: Record<string, number> = {};

  for (const row of findingsResult.rows) {
    const category = categories[categoryFor(row)];
    category.count += 1;
    category.award_value += numeric(row.award_value);
    category.rebate_value += numeric(row.rebate_value);
    if (row.confidence_tier) confidence[row.confidence_tier] = (confidence[row.confidence_tier] ?? 0) + 1;
    findingCodes[row.finding_code] = (findingCodes[row.finding_code] ?? 0) + 1;
  }

  const missingKeys: CategoryKey[] = ['supplier_side_issue', 'buyer_side_issue', 'both_sides_missing', 'needs_review'];
  const missing = missingKeys.reduce((total, key) => ({
    count: total.count + categories[key].count,
    award_value: total.award_value + categories[key].award_value,
    rebate_value: total.rebate_value + categories[key].rebate_value,
  }), { count: 0, award_value: 0, rebate_value: 0 });

  return NextResponse.json({
    year,
    month,
    stored_awards: {
      count: Number(storedResult.rows[0]?.count ?? 0),
      award_value: numeric(storedResult.rows[0]?.award_value),
    },
    evidence_awards: findingsResult.rows.length,
    missing_or_at_risk: missing,
    categories,
    confidence,
    finding_codes: findingCodes,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
