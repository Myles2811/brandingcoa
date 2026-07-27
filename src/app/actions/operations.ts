'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  isOpportunityReviewStatus,
  upsertOpportunityReview,
  type OpportunityReviewStatus,
} from '@/lib/reconciliation/opportunityReviewStore';
import { SearchResponse } from '@/lib/types';

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

async function localOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  if (!host) throw new Error('Unable to determine the application host.');
  const protocol = requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

async function postInternal(path: string, body: unknown): Promise<{ response: Response; data: Record<string, unknown> }> {
  const apiKey = process.env.RECONCILIATION_API_KEY?.trim();
  if (!apiKey) throw new Error('RECONCILIATION_API_KEY is not configured.');
  const response = await fetch(`${await localOrigin()}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({ error: `Request failed with HTTP ${response.status}` })) as Record<string, unknown>;
  return { response, data };
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
    const { response, data } = await postInternal('/api/search', {
      year, month, useContractsFinderCrossCheck: true, allowFallbackScrape: true,
      strictMode: false, exclusionListText: '',
    });
    const result = data as unknown as Partial<SearchResponse> & { error?: string };
    const errors = [...issueMessages(result.issues), ...(result.error ? [result.error] : [])];
    const persisted = Array.isArray(result.results) ? result.results : [];
    return {
      ok: response.ok || response.status === 206,
      complete: result.complete === true,
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
    const { response, data } = await postInternal('/api/reconciliation/run', { external_award_ids: ids });
    const summary = data.summary && typeof data.summary === 'object' ? data.summary as Record<string, number> : {};
    return {
      ok: response.ok || response.status === 206,
      complete: data.complete === true,
      runId: typeof data.runId === 'string' ? data.runId : null,
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
    await upsertOpportunityReview({
      opportunityKey,
      status: input.status,
      note: input.note,
      dueNowRebate,
      updatedBy: input.updatedBy,
    });
    revalidatePath('/');
    return { ok: true, errors: [] };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}
