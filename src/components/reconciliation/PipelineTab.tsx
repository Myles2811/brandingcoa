'use client';

import { useMemo } from 'react';
import DataState from './DataState';
import {
  AwardMatchConfidenceBadge,
  EvidenceChip,
  FindingConfidenceBadge,
  FrameworkRegisterBadge,
  OpportunityIssueBadge,
  ReviewStatusBadge,
} from './Badges';
import {
  dateLabel,
  frameworkDisplay,
  frameworkRegisterStatus,
  matchJustification,
  money,
  organisationName,
  primaryAward,
  supplierName,
} from './format';
import {
  dueNowRebate,
  issueForFinding,
  lifetimeRebate,
  type OpportunityIssue,
  opportunityIssueMeta,
  recommendedAction,
  reviewStatusVisuals,
} from './opportunityModel';
import { OpportunityReviewStatus, ReconciliationFindingRecord } from './types';

const issueFilters: Array<OpportunityIssue | 'all'> = [
  'all',
  'buyer_side_issue',
  'supplier_side_issue',
  'both_sides_missing',
  'needs_review',
  'framework_not_confirmed',
  'on_track',
];

const statusFilters: Array<OpportunityReviewStatus | 'all'> = [
  'all',
  'new',
  'acknowledged',
  'in_review',
  'outreach_sent',
  'resolved',
  'not_relevant',
];

const statusLabels: Record<OpportunityReviewStatus | 'all', string> = {
  all: 'All statuses',
  new: 'New',
  acknowledged: 'Acknowledged',
  in_review: 'In review',
  outreach_sent: 'Outreach sent',
  resolved: 'Resolved',
  not_relevant: 'Not relevant',
};

function sourceLabel(value: string | null | undefined): string {
  if (!value) return '-';
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
}

export interface PipelineFilters {
  query: string;
  month: string;
  buyer: string;
  supplier: string;
  framework: string;
  issue: OpportunityIssue | 'all';
  status: OpportunityReviewStatus | 'all';
  surfacedWithinDays: number | null;
  dateFrom: string;
  dateTo: string;
}

export const defaultPipelineFilters: PipelineFilters = {
  query: '',
  month: 'all',
  buyer: 'all',
  supplier: 'all',
  framework: 'all',
  issue: 'all',
  status: 'all',
  surfacedWithinDays: null,
  dateFrom: '',
  dateTo: '',
};

function dateValue(value: string | null | undefined, endOfDay = false): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function surfacedSince(days: number): number {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function optionValues(findings: ReconciliationFindingRecord[]) {
  const buyers = new Set<string>();
  const suppliers = new Set<string>();
  const frameworks = new Map<string, string>();
  for (const finding of findings) {
    buyers.add(organisationName(finding));
    suppliers.add(supplierName(finding));
    const framework = frameworkDisplay(finding);
    const key = framework.reference ?? framework.name ?? 'Unresolved';
    frameworks.set(key, framework.reference ? `${framework.reference}${framework.name ? ` - ${framework.name}` : ''}` : key);
  }
  return {
    buyers: [...buyers].sort((a, b) => a.localeCompare(b)),
    suppliers: [...suppliers].sort((a, b) => a.localeCompare(b)),
    frameworks: [...frameworks.entries()].sort((a, b) => a[1].localeCompare(b[1])),
  };
}

function NewOpportunitiesSpotlight({ findings, filters, onFiltersChange }: {
  findings: ReconciliationFindingRecord[];
  filters: PipelineFilters;
  onFiltersChange: (filters: PipelineFilters) => void;
}) {
  const newFindings = findings.filter(finding => (finding.opportunity_review?.status ?? 'new') === 'new');
  const windows = [7, 10, 30];
  const stats = windows.map(days => {
    const since = surfacedSince(days);
    const rows = newFindings.filter(finding => {
      const created = dateValue(finding.created_at);
      return created !== null && created >= since;
    });
    return {
      days,
      count: rows.length,
    };
  });
  const selectedDays = filters.status === 'new' && filters.surfacedWithinDays
    ? filters.surfacedWithinDays
    : 7;
  const selected = stats.find(row => row.days === selectedDays) ?? stats[0];
  const reviewWindow = (days: number) => onFiltersChange({
    ...defaultPipelineFilters,
    status: 'new',
    surfacedWithinDays: days,
  });

  return (
    <section className="overflow-hidden rounded-xl border border-[#B8C7FF] bg-[#F6F9FF] shadow-[0_10px_30px_rgba(42,100,255,0.08)]">
      <div className="grid gap-3 p-3.5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500 shadow-[0_0_0_5px_rgba(14,165,233,0.12)] skeleton-pulse" />
            <p className="text-xs font-semibold uppercase text-[#2A64FF]">New opportunities</p>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-2">
            <div>
              <p className="text-lg font-semibold text-[#101828]">{selected.count} surfaced in the last {selected.days} days</p>
              <p className="mt-0.5 text-xs text-[#667085]">Review newly surfaced opportunities from the latest operating window.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {stats.map(row => (
            <button
              key={row.days}
              type="button"
              onClick={() => reviewWindow(row.days)}
              className={`h-8 rounded-md border px-3 text-xs font-semibold transition ${
                filters.status === 'new' && filters.surfacedWithinDays === row.days
                  ? 'border-[#2A64FF] bg-[#0B1F4D] text-white'
                  : 'border-[#B8C7FF] bg-white text-[#0B1F4D] hover:bg-[#EEF3FF]'
              }`}
              title={`${row.count} new opportunities surfaced in the last ${row.days} days`}
            >
              Last {row.days} days
            </button>
          ))}
          <button
            type="button"
            onClick={() => reviewWindow(7)}
            className="h-8 rounded-md bg-[#2A64FF] px-3 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(42,100,255,0.24)] transition hover:bg-[#1D4FE8]"
          >
            Review new
          </button>
        </div>
      </div>
    </section>
  );
}

export default function PipelineTab({ findings, loading, error, onOpenCase, filters, onFiltersChange, monthOptions }: {
  findings: ReconciliationFindingRecord[];
  loading: boolean;
  error: string | null;
  onOpenCase: (finding: ReconciliationFindingRecord) => void;
  filters: PipelineFilters;
  onFiltersChange: (filters: PipelineFilters) => void;
  monthOptions: Array<{ value: string; label: string }>;
}) {
  const { query, month, buyer, supplier, framework: frameworkFilter, issue, status, surfacedWithinDays, dateFrom, dateTo } = filters;
  const setQuery = (value: string) => onFiltersChange({ ...filters, query: value });
  const setMonth = (value: string) => onFiltersChange({ ...filters, month: value });
  const setBuyer = (value: string) => onFiltersChange({ ...filters, buyer: value });
  const setSupplier = (value: string) => onFiltersChange({ ...filters, supplier: value });
  const setFramework = (value: string) => onFiltersChange({ ...filters, framework: value });
  const setIssue = (value: OpportunityIssue | 'all') => onFiltersChange({ ...filters, issue: value });
  const setStatus = (value: OpportunityReviewStatus | 'all') => onFiltersChange({ ...filters, status: value });
  const setDateFrom = (value: string) => onFiltersChange({ ...filters, dateFrom: value });
  const setDateTo = (value: string) => onFiltersChange({ ...filters, dateTo: value });
  const resetFilters = () => onFiltersChange(defaultPipelineFilters);
  const options = useMemo(() => optionValues(findings), [findings]);

  const rows = useMemo(() => findings.filter(finding => {
    const findingIssue = issueForFinding(finding);
    const reviewStatus = finding.opportunity_review?.status ?? 'new';
    const framework = frameworkDisplay(finding);
    const award = primaryAward(finding);
    const published = dateValue(award?.publication_date);
    const surfaced = dateValue(finding.created_at);
    const from = dateValue(dateFrom);
    const to = dateValue(dateTo, true);
    const surfacedFrom = surfacedWithinDays ? surfacedSince(surfacedWithinDays) : null;
    const text = `${organisationName(finding)} ${supplierName(finding)} ${framework.reference ?? ''} ${framework.name ?? ''}`.toLowerCase();
    const frameworkKey = framework.reference ?? framework.name ?? 'Unresolved';
    const awardMonth = award?.publication_date && !Number.isNaN(new Date(award.publication_date).getTime())
      ? `${new Date(award.publication_date).getFullYear()}-${String(new Date(award.publication_date).getMonth() + 1).padStart(2, '0')}`
      : null;
    return (issue === 'all' || findingIssue === issue) &&
      (status === 'all' || reviewStatus === status) &&
      (!surfacedFrom || (surfaced !== null && surfaced >= surfacedFrom)) &&
      (month === 'all' || awardMonth === month) &&
      (buyer === 'all' || organisationName(finding) === buyer) &&
      (supplier === 'all' || supplierName(finding) === supplier) &&
      (frameworkFilter === 'all' || frameworkKey === frameworkFilter) &&
      (!from || (published !== null && published >= from)) &&
      (!to || (published !== null && published <= to)) &&
      text.includes(query.toLowerCase());
  }).sort((a, b) => {
    const aNew = (a.opportunity_review?.status ?? 'new') === 'new' ? 1 : 0;
    const bNew = (b.opportunity_review?.status ?? 'new') === 'new' ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    const createdDiff = (dateValue(b.created_at) ?? 0) - (dateValue(a.created_at) ?? 0);
    if (createdDiff !== 0) return createdDiff;
    const dueDiff = dueNowRebate(b) - dueNowRebate(a);
    if (dueDiff !== 0) return dueDiff;
    return (b.award_contract_value ?? 0) - (a.award_contract_value ?? 0);
  }), [buyer, dateFrom, dateTo, findings, frameworkFilter, issue, month, query, status, supplier, surfacedWithinDays]);

  return (
    <div className="space-y-3">
      <NewOpportunitiesSpotlight findings={findings} filters={filters} onFiltersChange={onFiltersChange} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#101828]">Matched Award Opportunities</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#667085]">
            Review surfaced awards, confirm the evidence trail, and record the operational outcome for the next reviewer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Search opportunities" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search buyer, supplier, framework" className="h-9 w-full rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none placeholder:text-[#98A2B3] focus:border-[#2A64FF] sm:w-64 lg:w-72" />
          <select aria-label="Filter by month" value={month} onChange={event => setMonth(event.target.value)} className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]">
            <option value="all">All months</option>
            {monthOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select aria-label="Filter by buyer" value={buyer} onChange={event => setBuyer(event.target.value)} className="h-9 max-w-56 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]">
            <option value="all">All buyers</option>
            {options.buyers.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Filter by supplier" value={supplier} onChange={event => setSupplier(event.target.value)} className="h-9 max-w-56 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]">
            <option value="all">All suppliers</option>
            {options.suppliers.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Filter by framework" value={frameworkFilter} onChange={event => setFramework(event.target.value)} className="h-9 max-w-60 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]">
            <option value="all">All frameworks</option>
            {options.frameworks.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Filter by issue" value={issue} onChange={event => setIssue(event.target.value as OpportunityIssue | 'all')} className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]">
            {issueFilters.map(value => <option key={value} value={value}>{value === 'all' ? 'All issues' : opportunityIssueMeta[value].label}</option>)}
          </select>
          <select aria-label="Filter by review status" value={status} onChange={event => setStatus(event.target.value as OpportunityReviewStatus | 'all')} className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]">
            {statusFilters.map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}
          </select>
          <input aria-label="Published from" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]" />
          <input aria-label="Published to" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]" />
          <button type="button" onClick={resetFilters} className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs font-semibold text-[#344054] transition hover:bg-[#F8FAFC]">
            Reset
          </button>
        </div>
      </div>

      <DataState loading={loading} error={error} empty={rows.length === 0} emptyMessage="No opportunities match the current filters.">
        <div className="grid gap-2.5">
          {rows.map(finding => {
            const award = primaryAward(finding);
            const framework = frameworkDisplay(finding);
            const registerStatus = frameworkRegisterStatus(finding);
            const issueKind = issueForFinding(finding);
            const reviewStatus = finding.opportunity_review?.status ?? 'new';
            const statusVisual = reviewStatusVisuals[reviewStatus];
            const noteCount = finding.opportunity_review?.notes?.length ?? 0;
            return (
              <article key={finding.id} className={`relative overflow-hidden rounded-xl border text-[#101828] shadow-[0_10px_28px_rgba(15,23,42,0.05)] transition hover:border-[#B8C7FF] hover:shadow-[0_14px_34px_rgba(42,100,255,0.09)] ${statusVisual.cardClass}`}>
                <div className={`absolute inset-y-0 left-0 w-1.5 ${statusVisual.railClass}`} aria-hidden="true" />
                {reviewStatus === 'new' && <span className="absolute right-4 top-4 z-10 h-2.5 w-2.5 rounded-full bg-sky-500 shadow-[0_0_0_5px_rgba(14,165,233,0.12)] skeleton-pulse" aria-label="New opportunity" />}
                <div className={`border-b border-[#E1E7F0] px-3 py-2.5 pl-5 ${statusVisual.headerClass}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <OpportunityIssueBadge issue={issueKind} />
                    <ReviewStatusBadge status={reviewStatus} />
                    <FindingConfidenceBadge tier={finding.confidence_tier} />
                  </div>
                </div>
                <div className="grid gap-3 p-3 pl-5 lg:grid-cols-[1.15fr_0.72fr_0.82fr_0.7fr] lg:items-start">
                  <div className="min-w-0">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase text-[#667085]">Buyer</p>
                        <h3 className="mt-0.5 truncate text-sm font-semibold text-[#101828]">{organisationName(finding)}</h3>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase text-[#667085]">Supplier</p>
                        <p className="mt-0.5 truncate text-sm font-semibold text-[#101828]">{supplierName(finding)}</p>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="rounded-md border border-[#E1E7F0] bg-[#F8FAFD] px-2.5 py-1.5">
                        <p className="text-xs font-semibold uppercase text-[#667085]">Published</p>
                        <p className="mt-0.5 text-xs font-semibold text-[#101828]">{dateLabel(award?.publication_date)}</p>
                      </div>
                      <div className="rounded-md border border-[#E1E7F0] bg-[#F8FAFD] px-2.5 py-1.5">
                        <p className="text-xs font-semibold uppercase text-[#667085]">Raw source</p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-[#101828]">{sourceLabel(award?.source)}</p>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#667085]">{award?.contract_description ?? finding.explanation}</p>
                  </div>

                  <div className="min-w-0 rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-2.5">
                    <p className="text-xs font-semibold uppercase text-[#667085]">Framework</p>
                    <p className="mt-1.5 font-mono text-xs font-semibold">{framework.reference ?? 'Unresolved'}</p>
                    {framework.name && <p className="mt-1 line-clamp-2 text-xs leading-snug text-[#667085]">{framework.name}</p>}
                    <div className="mt-2"><FrameworkRegisterBadge status={registerStatus} /></div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-2.5">
                      <p className="text-xs font-semibold uppercase text-[#667085]">Due now</p>
                      <p className="mt-1.5 text-sm font-semibold">{money(dueNowRebate(finding))}</p>
                    </div>
                    <div className="rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-2.5">
                      <p className="text-xs font-semibold uppercase text-[#667085]">Award value</p>
                      <p className="mt-1.5 text-sm font-semibold">{money(finding.award_contract_value ?? award?.award_value, award?.currency ?? 'GBP')}</p>
                    </div>
                    <div className="rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-2.5">
                      <p className="text-xs font-semibold uppercase text-[#667085]">Potential total</p>
                      <p className="mt-1.5 text-sm font-semibold">{money(lifetimeRebate(finding))}</p>
                    </div>
                    <div className="rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-2.5">
                      <p className="text-xs font-semibold uppercase text-[#667085]">Notes</p>
                      <p className="mt-1.5 text-sm font-semibold">{noteCount}</p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-[#667085]">Recommended next step</p>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#475467]">{recommendedAction(finding)}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <EvidenceChip kind="Buyer" verdict={finding.buyer_evidence?.verdict ?? null} />
                      <EvidenceChip kind="Supplier" verdict={finding.supplier_evidence?.verdict ?? null} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <AwardMatchConfidenceBadge confidence={award?.confidence} />
                      <span className="text-xs text-[#667085]">{dateLabel(award?.publication_date)}</span>
                    </div>
                    <button type="button" onClick={() => onOpenCase(finding)} className="mt-2 inline-flex h-8 items-center rounded-md border border-[#B8C7FF] bg-[#EEF3FF] px-3 text-xs font-semibold text-[#0B1F4D] transition hover:bg-[#E0E8FF]">
                      View evidence
                    </button>
                  </div>
                </div>
                <div className="mx-3 mb-3 ml-5 rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-2.5">
                  <p className="text-xs font-semibold uppercase text-[#667085]">Award surfacing evidence</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#667085]">{matchJustification(finding)}</p>
                </div>
              </article>
            );
          })}
        </div>
      </DataState>
    </div>
  );
}
