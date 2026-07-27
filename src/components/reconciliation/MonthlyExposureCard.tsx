'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import DataState from './DataState';
import { money } from './format';
import { dueNowRebate, issueForFinding, lifetimeRebate, opportunityIssueMeta, type OpportunityIssue } from './opportunityModel';
import { DashboardData, ReconciliationFindingRecord } from './types';

const issueColours: Record<OpportunityIssue, string> = {
  buyer_side_issue: '#F59E0B',
  supplier_side_issue: '#0EA5E9',
  both_sides_missing: '#EF4444',
  needs_review: '#94A3B8',
  framework_not_confirmed: '#CBD5E1',
  on_track: '#10B981',
};

function monthName(month: number): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, month - 1, 1)));
}

function monthOptions(anchor: { year: number; month: number }) {
  return Array.from({ length: 18 }, (_, index) => {
    const date = new Date(Date.UTC(anchor.year, anchor.month - 1 - index, 1));
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      label: `${monthName(date.getUTCMonth() + 1)} ${date.getUTCFullYear()}`,
      value: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
    };
  });
}

function rollup(findings: ReconciliationFindingRecord[]) {
  const groups = new Map<OpportunityIssue, { issue: OpportunityIssue; count: number; dueNow: number; lifetime: number; awardValue: number }>();
  for (const finding of findings) {
    const issue = issueForFinding(finding);
    const row = groups.get(issue) ?? { issue, count: 0, dueNow: 0, lifetime: 0, awardValue: 0 };
    row.count += 1;
    row.dueNow += dueNowRebate(finding);
    row.lifetime += lifetimeRebate(finding);
    row.awardValue += finding.award_contract_value ?? 0;
    groups.set(issue, row);
  }
  return [...groups.values()].sort((a, b) => b.dueNow - a.dueNow);
}

function Donut({ rows }: { rows: ReturnType<typeof rollup> }) {
  const total = rows.reduce((sum, row) => sum + row.dueNow, 0);
  const segments = rows
    .filter(row => row.dueNow > 0)
    .reduce((state, row) => {
      const start = state.cursor;
      const end = state.cursor + (row.dueNow / Math.max(total, 1)) * 100;
      return {
        cursor: end,
        values: [...state.values, `${issueColours[row.issue]} ${start}% ${end}%`],
      };
    }, { cursor: 0, values: [] as string[] });
  const background = segments.values.length ? `conic-gradient(${segments.values.join(', ')}, #E6ECF5 ${segments.cursor}% 100%)` : '#E6ECF5';
  return (
    <div className="relative mx-auto grid h-44 w-44 shrink-0 place-items-center rounded-full shadow-[inset_0_10px_26px_rgba(15,23,42,0.08),0_18px_34px_rgba(15,23,42,0.10)]" style={{ background }}>
      <div className="grid h-28 w-28 place-items-center rounded-full bg-white shadow-[inset_0_8px_18px_rgba(15,23,42,0.08)]">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase text-[#667085]">Due now</p>
          <p className="mt-0.5 text-[13px] font-semibold text-[#101828]">{money(total)}</p>
        </div>
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-h-24 rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-3">
      <p className="text-xs font-semibold uppercase text-[#667085]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[#101828]">{value}</p>
    </div>
  );
}

export default function MonthlyExposureCard({ initialMonth }: {
  initialMonth: { year: number; month: number };
}) {
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();
  const options = useMemo(() => monthOptions(initialMonth), [initialMonth]);
  const selectedValue = `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, '0')}`;

  useEffect(() => {
    startLoading(async () => {
      setError(null);
      try {
        const params = new URLSearchParams({ year: String(selectedMonth.year), month: String(selectedMonth.month) });
        const response = await fetch(`/api/reconciliation/dashboard?${params.toString()}`, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
        setData(result as DashboardData);
      } catch (loadError) {
        setData(null);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    });
  }, [selectedMonth]);

  const findings = data?.findings ?? [];
  const rows = rollup(findings);
  const dueNow = findings.reduce((sum, finding) => sum + dueNowRebate(finding), 0);
  const lifetime = findings.reduce((sum, finding) => sum + lifetimeRebate(finding), 0);
  const awardValue = findings.reduce((sum, finding) => sum + (finding.award_contract_value ?? 0), 0);
  const open = findings.filter(finding => {
    const issue = issueForFinding(finding);
    return issue !== 'on_track' && issue !== 'framework_not_confirmed';
  }).length;

  return (
    <section className="overflow-hidden rounded-xl border border-[#D7E2F2] bg-white text-[#101828] shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E1E7F0] bg-[#FBFCFF] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Monthly rebate exposure</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#667085]">
            Month-specific view of missing rebate exposure. Figures in this module only apply to the selected month.
          </p>
        </div>
        <label className="flex h-9 items-center gap-2 rounded-md border border-[#D0D5DD] bg-white px-3 text-xs shadow-sm">
          <span className="font-semibold uppercase text-[#667085]">Month</span>
          <select
            aria-label="Monthly exposure month"
            value={selectedValue}
            disabled={isLoading}
            onChange={event => {
              const [year, month] = event.target.value.split('-').map(Number);
              setSelectedMonth({ year, month });
            }}
            className="bg-white font-semibold text-[#101828] outline-none disabled:opacity-50"
          >
            {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <DataState loading={isLoading && !data} error={error} empty={findings.length === 0} emptyMessage="No rebate exposure was found for the selected month.">
        <div className="grid gap-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Missing rebate due now" value={money(dueNow)} />
            <MetricTile label="Open opportunities" value={open} />
            <MetricTile label="Lifetime estimate" value={money(lifetime)} />
            <MetricTile label="Award value reviewed" value={money(awardValue)} />
          </div>

          <div className="grid gap-4 2xl:grid-cols-[340px_1fr]">
            <div className="rounded-xl border border-[#E1E7F0] bg-[#F8FAFD] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#667085]">Exposure mix</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#667085]">Due-now rebate by issue type.</p>
                </div>
                <p className="rounded-md border border-[#E1E7F0] bg-white px-2 py-1 text-xs font-semibold text-[#475467]">{rows.length} groups</p>
              </div>
              <div className="mt-5 grid place-items-center">
                <Donut rows={rows} />
              </div>
            </div>

            <div className="rounded-xl border border-[#E1E7F0] bg-white">
              <div className="border-b border-[#E1E7F0] px-4 py-3">
                <p className="text-xs font-semibold uppercase text-[#667085]">Breakdown by issue</p>
                <p className="mt-1 text-xs text-[#667085]">Sorted by missing rebate due now.</p>
              </div>
              <div className="grid gap-2 p-3">
                {rows.map(row => {
                  const width = dueNow > 0 ? Math.max(4, (row.dueNow / dueNow) * 100) : 0;
                  return (
                    <div key={row.issue} className="rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: issueColours[row.issue] }} />
                          <p className="truncate text-xs font-semibold text-[#101828]">{opportunityIssueMeta[row.issue].label}</p>
                        </div>
                        <p className="whitespace-nowrap text-sm font-semibold">{money(row.dueNow)}</p>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E6ECF5]">
                        <div className="h-full rounded-full" style={{ width: `${width}%`, background: issueColours[row.issue] }} />
                      </div>
                      <p className="mt-1.5 text-xs text-[#667085]">{row.count} opportunities · {money(row.awardValue)} award value</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </DataState>
    </section>
  );
}
