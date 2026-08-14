'use server';

import { revalidatePath } from 'next/cache';
import { laravelJson, LaravelApiError } from '@/lib/laravelApi';
import type { OpportunityReviewStatus } from '@/components/reconciliation/types';

export interface ScanActionResult {
  ok: boolean;
  complete: boolean;
  year: number;
  month: number;
  rawCount: number;
  awardsFound: number;
  awardsPersisted: number;
  excludedCount: number;
  newAwardIds: string[];
  errors: string[];
}

export interface ReconciliationActionResult {
  ok: boolean;
  complete: boolean;
  runId: string | null;
  findings: number;
  summary: Record<string, number>;
  errors: string[];
}

export interface OpportunityReviewActionResult {
  ok: boolean;
  errors: string[];
}

interface SearchActionResponse {
  results?: { candidate_id: string }[];
  raw_count?: number;
  qualified_count?: number;
  persisted_count?: number;
  excluded_count?: number;
  complete?: boolean;
  issues?: unknown[];
  error?: string;
}

const opportunityReviewStatuses = new Set<OpportunityReviewStatus>([
  'new',
  'acknowledged',
  'in_review',
  'outreach_sent',
  'resolved',
  'not_relevant',
]);

function isOpportunityReviewStatus(value: unknown): value is OpportunityReviewStatus {
  return typeof value === 'string' && opportunityReviewStatuses.has(value as OpportunityReviewStatus);
}

function issueMessages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(issue => {
    if (!issue || typeof issue !== 'object') return String(issue);
    const record = issue as Record<string, unknown>;
    const message = String(record.message ?? record.code ?? 'Unknown processing issue');
    return record.source ? `${record.source}: ${message}` : message;
  });
}

export async function runExternalScanAction(input: { year: number; month: number }): Promise<ScanActionResult> {
  const year = Number(input.year);
  const month = Number(input.month);
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, complete: false, year, month, rawCount: 0, awardsFound: 0, awardsPersisted: 0,
      excludedCount: 0, newAwardIds: [], errors: ['Select a valid month and year.'] };
  }
  try {
    const data = await laravelJson<SearchActionResponse>('/search', {
      method: 'POST',
      body: JSON.stringify({
        year,
        month,
        useContractsFinderCrossCheck: true,
        allowFallbackScrape: true,
        strictMode: false,
        exclusionListText: '',
      }),
    });
    const result = data;
    const errors = [...issueMessages(result.issues), ...(result.error ? [result.error] : [])];
    const persisted = Array.isArray(result.results) ? result.results : [];
    return {
      ok: true,
      complete: result.complete === true || result.complete === undefined,
      year, month,
      rawCount: Number(result.raw_count ?? 0),
      awardsFound: Number(result.qualified_count ?? persisted.length),
      awardsPersisted: Number(result.persisted_count ?? persisted.length),
      excludedCount: Number(result.excluded_count ?? 0),
      newAwardIds: persisted.map(award => award.candidate_id),
      errors,
    };
  } catch (error) {
    return { ok: false, complete: false, year, month, rawCount: 0, awardsFound: 0, awardsPersisted: 0,
      excludedCount: 0, newAwardIds: [], errors: [error instanceof Error ? error.message : String(error)] };
  }
}

export async function runReconciliationAction(externalAwardIds: string[]): Promise<ReconciliationActionResult> {
  const ids = [...new Set(externalAwardIds.filter(value => typeof value === 'string' && value.length > 0))];
  if (ids.length === 0) return { ok: false, complete: false, runId: null, findings: 0, summary: {}, errors: ['No newly persisted awards are available to reconcile.'] };
  try {
    const data = await laravelJson<Record<string, unknown>>('/reconciliation/run', {
      method: 'POST',
      body: JSON.stringify({ external_award_ids: ids }),
    });
    const summary = data.summary && typeof data.summary === 'object' ? data.summary as Record<string, number> : {};
    return {
      ok: true,
      complete: data.complete === true || data.status === 'completed',
      runId: typeof data.runId === 'string' ? data.runId : typeof data.run_id === 'string' ? data.run_id : null,
      findings: Object.values(summary).reduce((total, count) => total + Number(count), 0),
      summary,
      errors: issueMessages(data.issues).concat(typeof data.error === 'string' ? [data.error] : []),
    };
  } catch (error) {
    return { ok: false, complete: false, runId: null, findings: 0, summary: {}, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

export async function updateOpportunityReviewAction(input: {
  opportunityKey: string;
  status: OpportunityReviewStatus;
  note?: string;
  dueNowRebate?: number | null;
  updatedBy?: string;
}): Promise<OpportunityReviewActionResult> {
  const opportunityKey = input.opportunityKey?.trim();
  if (!opportunityKey) return { ok: false, errors: ['Missing opportunity key.'] };
  if (!isOpportunityReviewStatus(input.status)) return { ok: false, errors: ['Invalid opportunity status.'] };
  const dueNowRebate = input.dueNowRebate;
  if (dueNowRebate !== undefined && dueNowRebate !== null && (!Number.isFinite(dueNowRebate) || dueNowRebate < 0)) {
    return { ok: false, errors: ['Due-now rebate must be zero or more.'] };
  }
  try {
    await laravelJson('/reconciliation/opportunity-review', {
      method: 'POST',
      body: JSON.stringify({
        opportunity_key: opportunityKey,
        status: input.status,
        note: input.note,
        due_now_rebate: dueNowRebate,
        updated_by: input.updatedBy,
      }),
    });
    revalidatePath('/');
    return { ok: true, errors: [] };
  } catch (error) {
    const message = error instanceof LaravelApiError || error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [message] };
  }
}
