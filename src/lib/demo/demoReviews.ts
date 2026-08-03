/**
 * In-session stand-in for the opportunity-review server action.
 *
 * The static demo build has no server and no database, so review outcomes are held
 * in React state for the life of the page. Saves feel exactly like the live app —
 * status, due-now rebate and notes all update immediately — but nothing persists
 * across a reload.
 */
import {
  OpportunityReview,
  OpportunityReviewStatus,
  ReconciliationFindingRecord,
} from '@/components/reconciliation/types';
import { opportunityKey } from '@/components/reconciliation/opportunityModel';

export type DemoReviewOverrides = Record<string, OpportunityReview>;

export interface DemoReviewSave {
  opportunityKey: string;
  status: OpportunityReviewStatus;
  note?: string;
  dueNowRebate?: number | null;
  updatedBy?: string;
}

export interface DemoReviewSaveResult {
  ok: boolean;
  errors: string[];
}

const reviewStatuses: OpportunityReviewStatus[] = [
  'new', 'acknowledged', 'in_review', 'outreach_sent', 'resolved', 'not_relevant',
];

function baseReview(key: string, existing: OpportunityReview | undefined): OpportunityReview {
  return existing ?? {
    opportunity_key: key,
    status: 'new',
    due_now_rebate: null,
    updated_by: null,
    last_action_at: null,
    updated_at: null,
    notes: [],
  };
}

/** Same validation the server action applied, so the demo rejects the same inputs. */
export function validateDemoReviewSave(input: DemoReviewSave): string[] {
  const errors: string[] = [];
  if (!input.opportunityKey?.trim()) errors.push('Missing opportunity key.');
  if (!reviewStatuses.includes(input.status)) errors.push('Invalid opportunity status.');
  const dueNow = input.dueNowRebate;
  if (dueNow !== undefined && dueNow !== null && (!Number.isFinite(dueNow) || dueNow < 0)) {
    errors.push('Due-now rebate must be zero or more.');
  }
  return errors;
}

/** Produces the review record the database would have returned after an upsert. */
export function nextDemoReview(
  input: DemoReviewSave,
  current: OpportunityReview | undefined,
): OpportunityReview {
  const key = input.opportunityKey.trim();
  const previous = baseReview(key, current);
  const now = new Date().toISOString();
  const trimmedNote = input.note?.trim();
  const notes = trimmedNote
    ? [
      {
        id: `demo-note-${key}-${previous.notes.length + 1}`,
        note: trimmedNote,
        author: input.updatedBy ?? 'dashboard',
        created_at: now,
      },
      ...previous.notes,
    ]
    : previous.notes;

  return {
    ...previous,
    opportunity_key: key,
    status: input.status,
    due_now_rebate: input.dueNowRebate === undefined ? previous.due_now_rebate : input.dueNowRebate,
    updated_by: input.updatedBy ?? 'dashboard',
    last_action_at: now,
    updated_at: now,
    notes,
  };
}

/** Layers session review edits over the snapshot findings. */
export function applyDemoReviews(
  findings: ReconciliationFindingRecord[],
  overrides: DemoReviewOverrides,
): ReconciliationFindingRecord[] {
  if (Object.keys(overrides).length === 0) return findings;
  return findings.map(finding => {
    const override = overrides[opportunityKey(finding)];
    return override ? { ...finding, opportunity_review: override } : finding;
  });
}
