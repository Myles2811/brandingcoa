export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { reconciliationAuthError } from '@/lib/reconciliation/auth';
import {
  isOpportunityReviewStatus,
  upsertOpportunityReview,
  type OpportunityReviewStatus,
} from '@/lib/reconciliation/opportunityReviewStore';

interface ReviewRequest {
  opportunity_key?: unknown;
  status?: unknown;
  note?: unknown;
  due_now_rebate?: unknown;
  updated_by?: unknown;
}

function stringValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function optionalNote(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 4000);
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function POST(request: NextRequest) {
  const authError = reconciliationAuthError(request);
  if (authError) return authError;

  let body: ReviewRequest = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const opportunityKey = stringValue(body.opportunity_key, 1000);
  const status = typeof body.status === 'string' && isOpportunityReviewStatus(body.status)
    ? body.status as OpportunityReviewStatus
    : null;
  const note = optionalNote(body.note);
  const dueNowRebate = optionalNumber(body.due_now_rebate);
  const updatedBy = stringValue(body.updated_by, 120) ?? 'dashboard';

  if (!opportunityKey) {
    return NextResponse.json({ error: 'opportunity_key is required.' }, { status: 400 });
  }
  if (!status) {
    return NextResponse.json({ error: 'status is invalid.' }, { status: 400 });
  }
  if (body.due_now_rebate !== undefined && dueNowRebate === undefined) {
    return NextResponse.json({ error: 'due_now_rebate must be a positive number or null.' }, { status: 400 });
  }

  try {
    await upsertOpportunityReview({
      opportunityKey,
      status,
      note,
      dueNowRebate,
      updatedBy,
    });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[Opportunity Review] Update failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
