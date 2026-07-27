import { AwardMatchConfidence, CaseStatus, ConfidenceTier, OpportunityReviewStatus, PipelineStatus } from './types';
import { FrameworkRegisterStatus } from './format';
import { OpportunityIssue, opportunityIssueMeta, reviewStatusVisuals } from './opportunityModel';

const pipelineStyles: Record<PipelineStatus, string> = {
  'Matched — No Action': 'bg-green-50 text-green-800 border-green-200',
  'Needs Review': 'bg-amber-50 text-amber-900 border-amber-200',
  'Case Opened': 'bg-red-50 text-red-800 border-red-200',
};

const caseStyles: Record<CaseStatus, string> = {
  New: 'bg-blue-50 text-blue-800 border-blue-200',
  Investigating: 'bg-amber-50 text-amber-900 border-amber-200',
  'No Rebate Received': 'bg-purple-50 text-purple-800 border-purple-200',
  'Confirmed Missing': 'bg-red-50 text-red-800 border-red-200',
  Resolved: 'bg-green-50 text-green-800 border-green-200',
};

export function PipelineBadge({ status }: { status: PipelineStatus }) {
  return <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${pipelineStyles[status]}`}>{status}</span>;
}

export function CaseBadge({ status }: { status: CaseStatus }) {
  return <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${caseStyles[status]}`}>{status}</span>;
}

export function FindingConfidenceBadge({ tier }: { tier: ConfidenceTier | null }) {
  const style = tier === 'HIGH'
    ? 'border-green-200 bg-green-50 text-green-800'
    : tier === 'MEDIUM'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : tier === 'LOW'
        ? 'border-red-200 bg-red-50 text-red-800'
        : 'border-slate-200 bg-slate-50 text-slate-500';
  return <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${style}`}>{tier ?? 'Unknown'} evidence</span>;
}

export function AwardMatchConfidenceBadge({ confidence }: { confidence: AwardMatchConfidence | string | null | undefined }) {
  const normalized = confidence === 'High' || confidence === 'Medium' || confidence === 'Low' ? confidence : null;
  const style = normalized === 'High'
    ? 'border-green-200 bg-green-50 text-green-800'
    : normalized === 'Medium'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : normalized === 'Low'
        ? 'border-red-200 bg-red-50 text-red-800'
        : 'border-slate-200 bg-slate-50 text-slate-500';
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${style}`} title="Original external scanner confidence that this notice is a matched Procurement Services award">
      {normalized ?? 'Unknown'} match
    </span>
  );
}

export function FrameworkRegisterBadge({ status }: { status: FrameworkRegisterStatus }) {
  const style = status.tone === 'confirmed'
    ? 'border-green-200 bg-green-50 text-green-800'
    : status.tone === 'review'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-slate-200 bg-slate-50 text-slate-600';
  return <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${style}`} title={status.reason}>{status.label}</span>;
}

export function EvidenceChip({ kind, verdict }: { kind: 'Buyer' | 'Supplier'; verdict: string | null }) {
  const positive = verdict === 'COA_CONFIRMED' || verdict === 'ON_SCHEDULE';
  const absent = !verdict;
  const style = absent ? 'border-slate-200 bg-slate-50 text-slate-500' : positive
    ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900';
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${style}`}>{kind}: {verdict?.replaceAll('_', ' ') ?? 'Not reached'}</span>;
}

const issueToneStyles = {
  red: 'border-red-300/70 bg-red-50 text-red-800',
  amber: 'border-amber-300/70 bg-amber-50 text-amber-900',
  green: 'border-emerald-300/70 bg-emerald-50 text-emerald-800',
  slate: 'border-slate-300/70 bg-slate-50 text-slate-700',
  blue: 'border-sky-300/70 bg-sky-50 text-sky-800',
};

export function OpportunityIssueBadge({ issue }: { issue: OpportunityIssue }) {
  const meta = opportunityIssueMeta[issue];
  return <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${issueToneStyles[meta.tone]}`}>{meta.label}</span>;
}

export function ReviewStatusBadge({ status }: { status: OpportunityReviewStatus }) {
  const visual = reviewStatusVisuals[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${visual.badgeClass}`} title={visual.description}>
      <span className={`h-1.5 w-1.5 rounded-full ${visual.dotClass} ${visual.pulse ? 'skeleton-pulse' : ''}`} />
      {visual.label}
    </span>
  );
}
