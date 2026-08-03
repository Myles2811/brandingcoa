'use client';

import { useMemo, useState } from 'react';
import { demoDefaultMonth, demoHeadlineRun, demoRunById } from '@/lib/demo/demoData';
import { downloadReport } from '@/lib/reconciliation/reportBuilder';
import DataState from './DataState';
import { confirmedFrameworkFindings, frameworkDisplay, money, organisationName, primaryAward, supplierName } from './format';
import { dueNowRebate, issueForFinding, lifetimeRebate, type OpportunityIssue, opportunityIssueMeta, reviewStatusVisuals } from './opportunityModel';
import { OpportunityReviewStatus, ReconciliationFindingRecord } from './types';

interface Rollup {
  key: string;
  label: string;
  count: number;
  awardValue: number;
  dueNow: number;
  lifetime: number;
  accentClass?: string;
  description?: string;
}

export interface AnalyticsDrillDown {
  label: string;
  query?: string;
  buyer?: string;
  supplier?: string;
  framework?: string;
  issue?: string;
  status?: OpportunityReviewStatus;
  dateFrom?: string;
  dateTo?: string;
}

interface ReportFilters {
  buyer: string;
  supplier: string;
  framework: string;
  issue: OpportunityIssue | 'all';
  status: OpportunityReviewStatus | 'all';
  dateFrom: string;
  dateTo: string;
}

const defaultReportFilters: ReportFilters = {
  buyer: 'all',
  supplier: 'all',
  framework: 'all',
  issue: 'all',
  status: 'all',
  dateFrom: '',
  dateTo: '',
};

const issueAccentClasses: Record<string, string> = {
  buyer_side_issue: 'bg-amber-500',
  supplier_side_issue: 'bg-sky-500',
  both_sides_missing: 'bg-red-500',
  needs_review: 'bg-slate-500',
  framework_not_confirmed: 'bg-slate-300',
  on_track: 'bg-emerald-500',
};

const reviewStatusLabels: Record<OpportunityReviewStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  in_review: 'In review',
  outreach_sent: 'Outreach sent',
  resolved: 'Resolved',
  not_relevant: 'Not relevant',
};

const reviewStatusOrder: OpportunityReviewStatus[] = ['new', 'acknowledged', 'in_review', 'outreach_sent', 'resolved', 'not_relevant'];

function dateValue(value: string | null | undefined, endOfDay = false): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function addToRollup(groups: Map<string, Rollup>, key: string, label: string, finding: ReconciliationFindingRecord, options?: { accentClass?: string; description?: string }) {
  const row = groups.get(key) ?? { key, label, count: 0, awardValue: 0, dueNow: 0, lifetime: 0 };
  row.count += 1;
  row.awardValue += finding.award_contract_value ?? 0;
  row.dueNow += dueNowRebate(finding);
  row.lifetime += lifetimeRebate(finding);
  if (options?.accentClass) row.accentClass = options.accentClass;
  if (options?.description) row.description = options.description;
  groups.set(key, row);
}

function drillHint(row: Rollup): string {
  return `Open ${row.count} matching ${row.count === 1 ? 'opportunity' : 'opportunities'}`;
}

function Bars({ rows, valueKey, onDrillDown }: {
  rows: Rollup[];
  valueKey: 'dueNow' | 'awardValue' | 'lifetime' | 'count';
  onDrillDown?: (row: Rollup) => void;
}) {
  const max = Math.max(1, ...rows.map(row => row[valueKey]));
  return (
    <div className="space-y-3">
      {rows.map(row => (
        <button
          key={row.key}
          type="button"
          onClick={() => onDrillDown?.(row)}
          disabled={!onDrillDown}
          title={onDrillDown ? drillHint(row) : undefined}
          className="w-full rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-3 text-left transition hover:border-[#B8C7FF] hover:bg-white hover:shadow-[0_10px_28px_rgba(42,100,255,0.08)] disabled:cursor-default disabled:hover:border-[#E1E7F0] disabled:hover:bg-[#F8FAFD] disabled:hover:shadow-none"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[#101828]">{row.label}</p>
              <p className="mt-0.5 text-xs text-[#667085]">{onDrillDown ? drillHint(row) : row.description ?? `${row.count} opportunities`}</p>
            </div>
            <p className="whitespace-nowrap text-sm font-semibold text-[#101828]">{valueKey === 'count' ? row.count.toLocaleString('en-GB') : money(row[valueKey])}</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E6ECF5]">
            <div className={`h-full rounded-full ${row.accentClass ?? 'bg-[linear-gradient(90deg,#16A34A,#2A64FF,#7C3AED)]'}`} style={{ width: `${Math.max(4, (row[valueKey] / max) * 100)}%` }} />
          </div>
        </button>
      ))}
    </div>
  );
}

function DonutCard({ title, value, rows, onDrillDown }: { title: string; value: string; rows: Rollup[]; onDrillDown: (row: Rollup) => void }) {
  const total = rows.reduce((sum, row) => sum + row.dueNow, 0);
  const donut = rows
    .filter(row => row.dueNow > 0)
    .reduce((state, row) => {
      const start = state.cursor;
      const end = state.cursor + (row.dueNow / Math.max(total, 1)) * 100;
      return {
        cursor: end,
        segments: [...state.segments, `${colorForClass(row.accentClass)} ${start}% ${end}%`],
      };
    }, { cursor: 0, segments: [] as string[] });
  const background = donut.segments.length ? `conic-gradient(${donut.segments.join(', ')}, #E6ECF5 ${donut.cursor}% 100%)` : '#E6ECF5';
  return (
    <section className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-[#667085]">Due-now rebate split by operational route.</p>
          <div className="mt-4 rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] px-3 py-2">
            <p className="text-xs font-semibold uppercase text-[#667085]">Due now</p>
            <p className="mt-1 text-lg font-semibold text-[#101828]">{value}</p>
          </div>
        </div>
        <div className="relative mx-auto grid h-32 w-32 shrink-0 place-items-center rounded-full sm:h-36 sm:w-36" style={{ background }}>
          <div className="h-20 w-20 rounded-full bg-white shadow-inner sm:h-24 sm:w-24" />
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map(row => (
          <button
            key={row.key}
            type="button"
            onClick={() => onDrillDown(row)}
            title={drillHint(row)}
            className="flex items-center justify-between gap-2 rounded-lg bg-[#F8FAFD] px-3 py-2 text-left transition hover:bg-[#EEF3FF]"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.accentClass ?? 'bg-slate-400'}`} />
              <span className="truncate text-xs font-semibold text-[#475467]">{row.label}</span>
            </div>
            <span className="text-xs font-semibold text-[#101828]">{money(row.dueNow)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function colorForClass(className: string | undefined): string {
  if (className?.includes('sky')) return '#0EA5E9';
  if (className?.includes('amber')) return '#F59E0B';
  if (className?.includes('red')) return '#EF4444';
  if (className?.includes('violet')) return '#8B5CF6';
  if (className?.includes('indigo')) return '#6366F1';
  if (className?.includes('emerald')) return '#10B981';
  if (className?.includes('slate')) return '#94A3B8';
  return '#2A64FF';
}

function SegmentedBar({ rows, valueKey, onDrillDown }: { rows: Rollup[]; valueKey: 'dueNow' | 'count'; onDrillDown?: (row: Rollup) => void }) {
  const total = rows.reduce((sum, row) => sum + row[valueKey], 0);
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-[#E6ECF5]">
        {rows.map(row => {
          const width = total > 0 ? (row[valueKey] / total) * 100 : 0;
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => onDrillDown?.(row)}
              disabled={!onDrillDown || width === 0}
              className={`${row.accentClass ?? 'bg-slate-400'} transition hover:brightness-95 disabled:cursor-default`}
              style={{ width: `${width}%` }}
              title={`${row.label}: ${valueKey === 'count' ? row.count : money(row.dueNow)}`}
              aria-label={`Open ${row.label} opportunities`}
            />
          );
        })}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {rows.map(row => (
          <button
            key={row.key}
            type="button"
            onClick={() => onDrillDown?.(row)}
            disabled={!onDrillDown}
            title={onDrillDown ? drillHint(row) : undefined}
            className="rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] px-3 py-2 text-left transition hover:border-[#B8C7FF] hover:bg-white disabled:cursor-default disabled:hover:border-[#E1E7F0] disabled:hover:bg-[#F8FAFD]"
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${row.accentClass ?? 'bg-slate-400'}`} />
              <p className="truncate text-xs font-semibold text-[#475467]">{row.label}</p>
            </div>
            <p className="mt-1 text-sm font-semibold text-[#101828]">{valueKey === 'count' ? row.count.toLocaleString('en-GB') : money(row.dueNow)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function RankedTable({ title, description, rows, onDrillDown }: { title: string; description: string; rows: Rollup[]; onDrillDown: (row: Rollup) => void }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#E1E7F0] bg-white shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
      <div className="border-b border-[#E1E7F0] p-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-[#667085]">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead className="bg-[#F8FAFD]"><tr>{['Name', 'Opportunities', 'Due now', 'Lifetime estimate', 'Award value'].map(heading => <th key={heading} className="border-b border-[#E1E7F0] px-4 py-3 text-left text-xs font-semibold uppercase text-[#667085]">{heading}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.key} className="border-b border-[#EEF2F7] last:border-0">
            <td className="max-w-[30rem] px-4 py-3 text-sm font-semibold">
              <button type="button" onClick={() => onDrillDown(row)} title={drillHint(row)} className="block max-w-full truncate text-left text-[#0B1F4D] underline decoration-transparent underline-offset-4 transition hover:decoration-[#2A64FF]">
                {row.label}
              </button>
            </td>
            <td className="px-4 py-3 text-sm text-[#667085]">{row.count}</td>
            <td className="px-4 py-3 text-sm font-semibold">{money(row.dueNow)}</td>
            <td className="px-4 py-3 text-sm text-[#667085]">{money(row.lifetime)}</td>
            <td className="px-4 py-3 text-sm text-[#667085]">{money(row.awardValue)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function reportOptions(findings: ReconciliationFindingRecord[]) {
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

function findingMatchesReportFilters(finding: ReconciliationFindingRecord, filters: ReportFilters): boolean {
  const framework = frameworkDisplay(finding);
  const frameworkKey = framework.reference ?? framework.name ?? 'Unresolved';
  const status = finding.opportunity_review?.status ?? 'new';
  const issue = issueForFinding(finding);
  const published = dateValue(primaryAward(finding)?.publication_date);
  const from = dateValue(filters.dateFrom);
  const to = dateValue(filters.dateTo, true);
  return (filters.buyer === 'all' || organisationName(finding) === filters.buyer) &&
    (filters.supplier === 'all' || supplierName(finding) === filters.supplier) &&
    (filters.framework === 'all' || frameworkKey === filters.framework) &&
    (filters.issue === 'all' || issue === filters.issue) &&
    (filters.status === 'all' || status === filters.status) &&
    (!from || (published !== null && published >= from)) &&
    (!to || (published !== null && published <= to));
}

function ReportExportPanel({ findings, runId }: { findings: ReconciliationFindingRecord[]; runId?: string }) {
  const [filters, setFilters] = useState<ReportFilters>(defaultReportFilters);
  const options = useMemo(() => reportOptions(findings), [findings]);
  const preview = useMemo(() => {
    const rows = findings.filter(finding => findingMatchesReportFilters(finding, filters));
    return {
      count: rows.length,
      dueNow: rows.reduce((sum, finding) => sum + dueNowRebate(finding), 0),
      lifetime: rows.reduce((sum, finding) => sum + lifetimeRebate(finding), 0),
    };
  }, [filters, findings]);
  // Static demo build: the pack is generated in the browser from the loaded findings
  // instead of being streamed from /api/reconciliation/report.
  const [building, setBuilding] = useState<'pdf' | 'xlsx' | null>(null);
  const runLabel = useMemo(() => {
    const run = demoRunById(runId) ?? demoHeadlineRun;
    const month = new Date(Date.UTC(demoDefaultMonth.year, demoDefaultMonth.month - 1, 1));
    const period = month.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return run ? `${run.id.slice(0, 8)} / ${period}` : `No run / ${period}`;
  }, [runId]);

  const buildReport = (format: 'pdf' | 'xlsx') => {
    setBuilding(format);
    const scoped = findings.filter(finding => findingMatchesReportFilters(finding, filters));
    const notAll = (value: string) => (value === 'all' ? null : value);
    try {
      downloadReport(format, scoped, runLabel, {
        buyer: notAll(filters.buyer),
        supplier: notAll(filters.supplier),
        framework: notAll(filters.framework),
        issue: filters.issue === 'all' ? null : filters.issue,
        status: filters.status === 'all' ? null : filters.status,
        dateFrom: filters.dateFrom || null,
        dateTo: filters.dateTo || null,
      });
    } finally {
      setBuilding(null);
    }
  };
  return (
    <section className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Report builder</h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#667085]">Build a focused PDF or Excel pack by buyer, supplier, framework, status, issue and publication period.</p>
        </div>
        <div className="rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] px-3 py-2 text-right">
          <p className="text-xs font-semibold uppercase text-[#667085]">Report scope</p>
          <p className="mt-1 text-sm font-semibold text-[#101828]">{preview.count} opportunities · {money(preview.dueNow)} due now</p>
          <p className="mt-0.5 text-xs text-[#667085]">{money(preview.lifetime)} lifetime estimate</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <select aria-label="Report buyer" value={filters.buyer} onChange={event => setFilters({ ...filters, buyer: event.target.value })} className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]">
          <option value="all">All buyers</option>
          {options.buyers.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Report supplier" value={filters.supplier} onChange={event => setFilters({ ...filters, supplier: event.target.value })} className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]">
          <option value="all">All suppliers</option>
          {options.suppliers.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Report framework" value={filters.framework} onChange={event => setFilters({ ...filters, framework: event.target.value })} className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]">
          <option value="all">All frameworks</option>
          {options.frameworks.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Report issue" value={filters.issue} onChange={event => setFilters({ ...filters, issue: event.target.value as OpportunityIssue | 'all' })} className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]">
          <option value="all">All issues</option>
          {Object.entries(opportunityIssueMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
        </select>
        <select aria-label="Report status" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value as OpportunityReviewStatus | 'all' })} className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]">
          <option value="all">All statuses</option>
          {reviewStatusOrder.map(value => <option key={value} value={value}>{reviewStatusLabels[value]}</option>)}
        </select>
        <input aria-label="Report published from" type="date" value={filters.dateFrom} onChange={event => setFilters({ ...filters, dateFrom: event.target.value })} className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]" />
        <input aria-label="Report published to" type="date" value={filters.dateTo} onChange={event => setFilters({ ...filters, dateTo: event.target.value })} className="h-9 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs text-[#101828] outline-none focus:border-[#2A64FF]" />
        <div className="flex gap-2">
          <button type="button" onClick={() => setFilters(defaultReportFilters)} className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-[#D0D5DD] bg-white px-3 text-xs font-semibold text-[#344054] shadow-sm transition hover:bg-[#F8FAFC]">Reset</button>
          <button type="button" onClick={() => buildReport('pdf')} disabled={building !== null} className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-[#D0D5DD] bg-white px-3 text-xs font-semibold text-[#344054] shadow-sm transition hover:bg-[#F8FAFC] disabled:opacity-45">{building === 'pdf' ? 'Building' : 'PDF'}</button>
          <button type="button" onClick={() => buildReport('xlsx')} disabled={building !== null} className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-[#B8C7FF] bg-[#EEF3FF] px-3 text-xs font-semibold text-[#0B1F4D] shadow-sm transition hover:bg-[#E0E8FF] disabled:opacity-45">{building === 'xlsx' ? 'Building' : 'Excel'}</button>
        </div>
      </div>
    </section>
  );
}

export default function ReportsTab({ findings, loading, error, reportRunId, onDrillDown }: {
  findings: ReconciliationFindingRecord[];
  loading: boolean;
  error: string | null;
  reportRunId?: string;
  onDrillDown: (drillDown: AnalyticsDrillDown) => void;
}) {
  const analytics = useMemo(() => {
    const confirmed = confirmedFrameworkFindings(findings);
    const issueGroups = new Map<string, Rollup>();
    const frameworkGroups = new Map<string, Rollup>();
    const supplierGroups = new Map<string, Rollup>();
    const buyerGroups = new Map<string, Rollup>();
    const statusGroups = new Map<string, Rollup>();

    for (const finding of findings) {
      const issue = issueForFinding(finding);
      addToRollup(issueGroups, issue, opportunityIssueMeta[issue].label, finding, {
        accentClass: issueAccentClasses[issue],
        description: opportunityIssueMeta[issue].shortLabel,
      });
      const status = finding.opportunity_review?.status ?? 'new';
      addToRollup(statusGroups, status, reviewStatusLabels[status], finding, {
        accentClass: reviewStatusVisuals[status].barClass,
        description: reviewStatusVisuals[status].description,
      });
    }

    for (const finding of confirmed) {
      const framework = frameworkDisplay(finding);
      addToRollup(frameworkGroups, framework.reference ?? 'unresolved', framework.reference ? `${framework.reference}${framework.name ? ` · ${framework.name}` : ''}` : 'Unresolved framework', finding);
      addToRollup(supplierGroups, supplierName(finding), supplierName(finding), finding);
      addToRollup(buyerGroups, organisationName(finding), organisationName(finding), finding);
    }

    const sort = (rows: Rollup[], key: keyof Pick<Rollup, 'dueNow' | 'awardValue' | 'lifetime'>) =>
      rows.sort((a, b) => b[key] - a[key]).slice(0, 8);

    return {
      confirmed,
      issueRows: sort([...issueGroups.values()], 'dueNow'),
      frameworkRows: sort([...frameworkGroups.values()], 'dueNow'),
      supplierRows: sort([...supplierGroups.values()], 'dueNow'),
      buyerRows: sort([...buyerGroups.values()], 'dueNow'),
      allSupplierRows: [...supplierGroups.values()].sort((a, b) => b.dueNow - a.dueNow),
      allBuyerRows: [...buyerGroups.values()].sort((a, b) => b.dueNow - a.dueNow),
      statusRows: reviewStatusOrder.map(status => statusGroups.get(status) ?? {
        key: status,
        label: reviewStatusLabels[status],
        count: 0,
        awardValue: 0,
        dueNow: 0,
        lifetime: 0,
        accentClass: reviewStatusVisuals[status].barClass,
        description: reviewStatusVisuals[status].description,
      }),
      dueNow: confirmed.reduce((sum, finding) => sum + dueNowRebate(finding), 0),
      lifetime: confirmed.reduce((sum, finding) => sum + lifetimeRebate(finding), 0),
      awardValue: confirmed.reduce((sum, finding) => sum + (finding.award_contract_value ?? 0), 0),
      acknowledgedDueNow: [...statusGroups.values()].find(row => row.key === 'acknowledged')?.dueNow ?? 0,
      inReviewDueNow: [...statusGroups.values()].find(row => row.key === 'in_review')?.dueNow ?? 0,
      outreachDueNow: [...statusGroups.values()].find(row => row.key === 'outreach_sent')?.dueNow ?? 0,
      resolvedDueNow: [...statusGroups.values()].find(row => row.key === 'resolved')?.dueNow ?? 0,
    };
  }, [findings]);

  return (
    <div className="space-y-5 text-[#101828]">
      <div>
        <h2 className="text-lg font-semibold">Analytics</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#667085]">Confirmed-framework opportunity exposure, grouped by issue, framework, supplier and review status.</p>
      </div>
      <DataState loading={loading} error={error} empty={findings.length === 0} emptyMessage="No analytics data is available.">
        <ReportExportPanel findings={findings} runId={reportRunId} />

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase text-[#667085]">Due now</p>
            <p className="mt-3 text-lg font-semibold">{money(analytics.dueNow)}</p>
            <p className="mt-1 text-xs text-[#667085]">Confirmed framework opportunities</p>
          </div>
          <div className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase text-[#667085]">In review / outreach</p>
            <p className="mt-3 text-lg font-semibold">{money(analytics.inReviewDueNow + analytics.outreachDueNow)}</p>
            <p className="mt-1 text-xs text-[#667085]">Actively being worked or awaiting response</p>
          </div>
          <div className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase text-[#667085]">Lifetime estimate</p>
            <p className="mt-3 text-lg font-semibold">{money(analytics.lifetime)}</p>
            <p className="mt-1 text-xs text-[#667085]">Across current evidence records</p>
          </div>
          <div className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase text-[#667085]">Award value reviewed</p>
            <p className="mt-3 text-lg font-semibold">{money(analytics.awardValue)}</p>
            <p className="mt-1 text-xs text-[#667085]">{analytics.confirmed.length} confirmed opportunities</p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <DonutCard title="Rebate exposure mix" value={money(analytics.dueNow)} rows={analytics.issueRows} onDrillDown={row => onDrillDown({ label: row.label, issue: row.key })} />
          <section className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
            <h3 className="text-sm font-semibold">Workflow value by status</h3>
            <p className="mt-1 text-xs text-[#667085]">Missing rebate value grouped by operational status.</p>
            <div className="mt-5"><SegmentedBar rows={analytics.statusRows} valueKey="dueNow" onDrillDown={row => onDrillDown({ label: row.label, status: row.key as OpportunityReviewStatus })} /></div>
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
            <h3 className="text-sm font-semibold">Missing rebate by issue</h3>
            <p className="mt-1 text-xs text-[#667085]">Prioritise the operational route: buyer check, supplier outreach, or both.</p>
            <div className="mt-4"><Bars rows={analytics.issueRows} valueKey="dueNow" onDrillDown={row => onDrillDown({ label: row.label, issue: row.key })} /></div>
          </section>
          <section className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
            <h3 className="text-sm font-semibold">Missing rebate by framework</h3>
            <p className="mt-1 text-xs text-[#667085]">Framework-register confirmed only; unconfirmed items stay out of this total.</p>
            <div className="mt-4"><Bars rows={analytics.frameworkRows} valueKey="dueNow" onDrillDown={row => onDrillDown({ label: row.label, framework: row.key })} /></div>
          </section>
          <section className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
            <h3 className="text-sm font-semibold">Supplier exposure</h3>
            <p className="mt-1 text-xs text-[#667085]">Largest due-now amounts by supplier across confirmed opportunities.</p>
            <div className="mt-4"><Bars rows={analytics.supplierRows} valueKey="dueNow" onDrillDown={row => onDrillDown({ label: row.label, supplier: row.label })} /></div>
          </section>
          <section className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
            <h3 className="text-sm font-semibold">Review progress</h3>
            <p className="mt-1 text-xs text-[#667085]">Operational status across all surfaced opportunities.</p>
            <div className="mt-4 space-y-4">
              <SegmentedBar rows={analytics.statusRows} valueKey="count" onDrillDown={row => onDrillDown({ label: row.label, status: row.key as OpportunityReviewStatus })} />
              <Bars rows={analytics.statusRows} valueKey="dueNow" onDrillDown={row => onDrillDown({ label: row.label, status: row.key as OpportunityReviewStatus })} />
            </div>
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <RankedTable title="Customer rebate concentration" description="Total due-now rebate by buyer/customer." rows={analytics.allBuyerRows} onDrillDown={row => onDrillDown({ label: row.label, buyer: row.label })} />
          <RankedTable title="Supplier rebate concentration" description="Total due-now rebate by supplier." rows={analytics.allSupplierRows} onDrillDown={row => onDrillDown({ label: row.label, supplier: row.label })} />
        </div>
      </DataState>
    </div>
  );
}
