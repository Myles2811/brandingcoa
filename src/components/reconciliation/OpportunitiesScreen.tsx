'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authenticatedFetch } from '@/lib/auth/authenticated-fetch';
import CaseDrawer from './CaseDrawer';
import KpiRow from './KpiRow';
import PipelineTab, { PipelineFilters } from './PipelineTab';
import { opportunityKey, type OpportunityIssue } from './opportunityModel';
import { useReconciliationData } from './ReconciliationDataProvider';
import { DashboardData, OpportunityReviewStatus } from './types';

const issueValues = new Set<OpportunityIssue>([
  'buyer_side_issue',
  'supplier_side_issue',
  'both_sides_missing',
  'needs_review',
  'framework_not_confirmed',
  'on_track',
]);

const statusValues = new Set<OpportunityReviewStatus>([
  'new',
  'acknowledged',
  'in_review',
  'outreach_sent',
  'resolved',
  'not_relevant',
]);

function dashboardMonthOptions(anchor: { year: number; month: number }) {
  return Array.from({ length: 18 }, (_, index) => {
    const date = new Date(Date.UTC(anchor.year, anchor.month - 1 - index, 1));
    return {
      value: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date),
    };
  });
}

function filtersFromSearchParams(searchParams: URLSearchParams): PipelineFilters {
  const issue = searchParams.get('issue');
  const status = searchParams.get('status');
  const surfacedWithinDays = Number(searchParams.get('surfaced_within_days'));
  const month = searchParams.get('month');

  return {
    query: searchParams.get('query') ?? '',
    month: month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : 'all',
    buyer: searchParams.get('buyer') ?? 'all',
    supplier: searchParams.get('supplier') ?? 'all',
    framework: searchParams.get('framework') ?? 'all',
    issue: issue && issueValues.has(issue as OpportunityIssue) ? issue as OpportunityIssue : 'all',
    status: status && statusValues.has(status as OpportunityReviewStatus) ? status as OpportunityReviewStatus : 'all',
    surfacedWithinDays: [7, 10, 30].includes(surfacedWithinDays) ? surfacedWithinDays : null,
    dateFrom: searchParams.get('date_from') ?? '',
    dateTo: searchParams.get('date_to') ?? '',
  };
}

function filtersToSearchParams(filters: PipelineFilters, selectedCase?: string | null) {
  const params = new URLSearchParams();
  if (filters.query) params.set('query', filters.query);
  if (filters.month !== 'all') params.set('month', filters.month);
  if (filters.buyer !== 'all') params.set('buyer', filters.buyer);
  if (filters.supplier !== 'all') params.set('supplier', filters.supplier);
  if (filters.framework !== 'all') params.set('framework', filters.framework);
  if (filters.issue !== 'all') params.set('issue', filters.issue);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.surfacedWithinDays) params.set('surfaced_within_days', String(filters.surfacedWithinDays));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (selectedCase) params.set('case', selectedCase);
  return params;
}

export default function OpportunitiesScreen({ initialMonth }: {
  initialMonth: { year: number; month: number };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serializedSearchParams = searchParams.toString();
  const filters = useMemo(
    () => filtersFromSearchParams(new URLSearchParams(serializedSearchParams)),
    [serializedSearchParams],
  );
  const selectedCaseKey = searchParams.get('case');
  const [monthResult, setMonthResult] = useState<{ month: string; data: DashboardData } | null>(null);
  const { dashboardData, isLoading, isRefreshing } = useReconciliationData();
  const monthOptions = useMemo(() => dashboardMonthOptions(initialMonth), [initialMonth]);

  useEffect(() => {
    if (filters.month === 'all') {
      return;
    }

    const [year, month] = filters.month.split('-').map(Number);
    const controller = new AbortController();
    void authenticatedFetch(`/api/reconciliation/dashboard?year=${year}&month=${month}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
        setMonthResult({ month: filters.month, data: data as DashboardData });
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setMonthResult({
          month: filters.month,
          data: { run: null, findings: [], error: error instanceof Error ? error.message : String(error) },
        });
      });

    return () => controller.abort();
  }, [filters.month]);

  const selectedMonthData = monthResult?.month === filters.month ? monthResult.data : null;
  const displayedData = filters.month === 'all' ? dashboardData : selectedMonthData ?? { run: null, findings: [], error: null };
  const isMonthLoading = filters.month !== 'all' && selectedMonthData === null;
  const selectedCase = selectedCaseKey
    ? displayedData.findings.find(finding => opportunityKey(finding) === selectedCaseKey) ?? null
    : null;

  const navigate = (nextFilters: PipelineFilters, caseKey: string | null = selectedCaseKey) => {
    const params = filtersToSearchParams(nextFilters, caseKey);
    router.replace(`/opportunities${params.size ? `?${params.toString()}` : ''}`, { scroll: false });
  };

  return (
    <>
      <KpiRow
        findings={displayedData.findings}
        loading={isLoading || isRefreshing || isMonthLoading}
        error={displayedData.error}
      />
      <PipelineTab
        findings={displayedData.findings}
        loading={isLoading || isRefreshing || isMonthLoading}
        error={displayedData.error}
        onOpenCase={finding => navigate(filters, opportunityKey(finding))}
        filters={filters}
        onFiltersChange={nextFilters => navigate(nextFilters)}
        monthOptions={monthOptions}
      />
      {selectedCase && <CaseDrawer finding={selectedCase} onClose={() => navigate(filters, null)} />}
    </>
  );
}
