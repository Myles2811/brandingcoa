import { frameworkRegisterStatus } from './format';
import { FindingCode, OpportunityReviewStatus, ReconciliationFindingRecord } from './types';

export type OpportunityIssue =
  | 'buyer_side_issue'
  | 'supplier_side_issue'
  | 'both_sides_missing'
  | 'needs_review'
  | 'on_track'
  | 'framework_not_confirmed';

export interface OpportunityIssueMeta {
  label: string;
  shortLabel: string;
  tone: 'red' | 'amber' | 'green' | 'slate' | 'blue';
}

export const opportunityIssueMeta: Record<OpportunityIssue, OpportunityIssueMeta> = {
  buyer_side_issue: { label: 'Buyer-side issue', shortLabel: 'Buyer', tone: 'amber' },
  supplier_side_issue: { label: 'Supplier-side issue', shortLabel: 'Supplier', tone: 'blue' },
  both_sides_missing: { label: 'Buyer + supplier missing', shortLabel: 'Both missing', tone: 'red' },
  needs_review: { label: 'Needs review', shortLabel: 'Review', tone: 'slate' },
  on_track: { label: 'On track', shortLabel: 'On track', tone: 'green' },
  framework_not_confirmed: { label: 'Framework not confirmed', shortLabel: 'Framework review', tone: 'slate' },
};

export const reviewStatusLabels: Record<OpportunityReviewStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  in_review: 'In review',
  outreach_sent: 'Outreach sent',
  resolved: 'Resolved',
  not_relevant: 'Not relevant',
};

export interface ReviewStatusVisual {
  label: string;
  shortLabel: string;
  description: string;
  dotClass: string;
  badgeClass: string;
  activeButtonClass: string;
  inactiveButtonClass: string;
  barClass: string;
  cardClass: string;
  railClass: string;
  headerClass: string;
  pulse: boolean;
}

export const reviewStatusVisuals: Record<OpportunityReviewStatus, ReviewStatusVisual> = {
  new: {
    label: 'New',
    shortLabel: 'New',
    description: 'Not yet looked at',
    dotClass: 'bg-sky-500',
    badgeClass: 'border-sky-300 bg-sky-50 text-sky-800',
    activeButtonClass: 'border-sky-300 bg-sky-50 text-sky-800',
    inactiveButtonClass: 'border-sky-200 bg-white text-sky-800 hover:bg-sky-50',
    barClass: 'bg-sky-500',
    cardClass: 'border-sky-200 bg-white shadow-[0_14px_38px_rgba(14,165,233,0.10)]',
    railClass: 'bg-sky-500',
    headerClass: 'bg-sky-50/70',
    pulse: true,
  },
  acknowledged: {
    label: 'Acknowledged',
    shortLabel: 'Seen',
    description: 'Seen but not worked yet',
    dotClass: 'bg-indigo-500',
    badgeClass: 'border-indigo-300 bg-indigo-50 text-indigo-800',
    activeButtonClass: 'border-indigo-300 bg-indigo-50 text-indigo-800',
    inactiveButtonClass: 'border-indigo-200 bg-white text-indigo-800 hover:bg-indigo-50',
    barClass: 'bg-indigo-500',
    cardClass: 'border-indigo-100 bg-white',
    railClass: 'bg-indigo-500',
    headerClass: 'bg-indigo-50/70',
    pulse: false,
  },
  in_review: {
    label: 'In review',
    shortLabel: 'Review',
    description: 'Evidence is being checked',
    dotClass: 'bg-amber-500',
    badgeClass: 'border-amber-300 bg-amber-50 text-amber-900',
    activeButtonClass: 'border-amber-300 bg-amber-50 text-amber-900',
    inactiveButtonClass: 'border-amber-200 bg-white text-amber-900 hover:bg-amber-50',
    barClass: 'bg-amber-500',
    cardClass: 'border-amber-200 bg-white',
    railClass: 'bg-amber-500',
    headerClass: 'bg-amber-50/70',
    pulse: false,
  },
  outreach_sent: {
    label: 'Outreach sent',
    shortLabel: 'Outreach',
    description: 'Waiting for buyer or supplier response',
    dotClass: 'bg-violet-500',
    badgeClass: 'border-violet-300 bg-violet-50 text-violet-800',
    activeButtonClass: 'border-violet-300 bg-violet-50 text-violet-800',
    inactiveButtonClass: 'border-violet-200 bg-white text-violet-800 hover:bg-violet-50',
    barClass: 'bg-violet-500',
    cardClass: 'border-violet-100 bg-white',
    railClass: 'bg-violet-500',
    headerClass: 'bg-violet-50/70',
    pulse: false,
  },
  resolved: {
    label: 'Resolved',
    shortLabel: 'Resolved',
    description: 'Action complete',
    dotClass: 'bg-emerald-500',
    badgeClass: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    activeButtonClass: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    inactiveButtonClass: 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50',
    barClass: 'bg-emerald-500',
    cardClass: 'border-emerald-100 bg-emerald-50/30 opacity-80',
    railClass: 'bg-emerald-500',
    headerClass: 'bg-emerald-50/80',
    pulse: false,
  },
  not_relevant: {
    label: 'Not relevant',
    shortLabel: 'Excluded',
    description: 'Dismissed from active work',
    dotClass: 'bg-slate-400',
    badgeClass: 'border-slate-300 bg-slate-50 text-slate-700',
    activeButtonClass: 'border-slate-300 bg-slate-100 text-slate-700',
    inactiveButtonClass: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    barClass: 'bg-slate-400',
    cardClass: 'border-slate-200 bg-slate-50/70 opacity-75',
    railClass: 'bg-slate-400',
    headerClass: 'bg-slate-100/80',
    pulse: false,
  },
};

const actionByIssue: Record<OpportunityIssue, string> = {
  buyer_side_issue: 'Check buyer access/COA record, then update the rebate log or confirm why it is not required.',
  supplier_side_issue: 'Request supplier spend confirmation for the framework and reporting period.',
  both_sides_missing: 'Confirm buyer access and request supplier spend declaration before counting the rebate as secured.',
  needs_review: 'Review the evidence trail before sending outreach or changing the rebate position.',
  on_track: 'No follow-up needed unless the evidence is challenged.',
  framework_not_confirmed: 'Confirm the framework reference against the register before treating this as a live opportunity.',
};

export function opportunityKey(finding: ReconciliationFindingRecord): string {
  return finding.opportunity_review?.opportunity_key || finding.external_award_ids[0] || finding.id;
}

function textIncludes(value: string | null | undefined, pattern: RegExp): boolean {
  return pattern.test(value ?? '');
}

export function issueForFinding(finding: ReconciliationFindingRecord): OpportunityIssue {
  if (!frameworkRegisterStatus(finding).confirmed) return 'framework_not_confirmed';
  if (finding.finding_code === 'MATCHED' || finding.finding_code === 'NOT_YET_DUE') return 'on_track';

  const buyerVerdict = finding.buyer_evidence?.verdict ?? null;
  const supplierVerdict = finding.supplier_evidence?.verdict ?? null;
  const explanation = finding.explanation;
  const buyerMissing = buyerVerdict === 'NO_RECORD' ||
    buyerVerdict === 'CAA_ONLY' ||
    textIncludes(explanation, /Buyer:\s*(NO RECORD|CAA ONLY)/i) ||
    textIncludes(explanation, /buyer.*(no record|caa only|missing)/i);
  const supplierMissing = supplierVerdict === 'MISSING_FOR_DUE_PERIOD' ||
    supplierVerdict === 'NO_CYCLE_DEFINED' ||
    supplierVerdict === 'OFF_CYCLE' ||
    textIncludes(explanation, /Supplier:\s*(NO CYCLE DEFINED|NO SPEND|MISSING)/i) ||
    textIncludes(explanation, /supplier.*(no cycle|no spend|missing|off-cycle)/i);

  if (buyerMissing && supplierMissing) return 'both_sides_missing';
  if (buyerMissing) return 'buyer_side_issue';
  if (supplierMissing) return 'supplier_side_issue';
  if (finding.finding_code === 'EXTERNAL_AWARD_MISSING_REBATE_LOG') return 'both_sides_missing';
  if (finding.finding_code === 'COA_NO_SUPPLIER_SPEND') return 'supplier_side_issue';
  if (finding.finding_code === 'SUPPLIER_SPEND_UNMATCHED') return 'needs_review';
  return 'needs_review';
}

export function recommendedAction(finding: ReconciliationFindingRecord): string {
  return actionByIssue[issueForFinding(finding)];
}

export function dueNowRebate(finding: ReconciliationFindingRecord): number {
  const manual = finding.opportunity_review?.due_now_rebate;
  if (manual !== null && manual !== undefined && Number.isFinite(manual)) return manual;
  if (issueForFinding(finding) === 'on_track' || issueForFinding(finding) === 'framework_not_confirmed') return 0;
  if (finding.is_due === false) return 0;
  return finding.expected_rebate ?? finding.potential_rebate_lifetime_max ?? 0;
}

export function lifetimeRebate(finding: ReconciliationFindingRecord): number {
  return finding.potential_rebate_lifetime_max ?? finding.expected_rebate ?? 0;
}

export function isActionableOpportunity(finding: ReconciliationFindingRecord): boolean {
  const issue = issueForFinding(finding);
  return issue !== 'on_track' && issue !== 'framework_not_confirmed';
}

export function findingCodeLabel(code: FindingCode): string {
  return code.toLowerCase().split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
}
