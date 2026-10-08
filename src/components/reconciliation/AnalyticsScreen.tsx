'use client';

import { useRouter } from 'next/navigation';
import KpiRow from './KpiRow';
import MonthlyExposureCard from './MonthlyExposureCard';
import ReportsTab, { AnalyticsDrillDown } from './ReportsTab';
import { useReconciliationData } from './ReconciliationDataProvider';

function opportunitiesHref(drillDown: AnalyticsDrillDown) {
  const params = new URLSearchParams();
  if (drillDown.query) params.set('query', drillDown.query);
  if (drillDown.buyer) params.set('buyer', drillDown.buyer);
  if (drillDown.supplier) params.set('supplier', drillDown.supplier);
  if (drillDown.framework) params.set('framework', drillDown.framework);
  if (drillDown.issue) params.set('issue', drillDown.issue);
  if (drillDown.status) params.set('status', drillDown.status);
  if (drillDown.dateFrom) params.set('date_from', drillDown.dateFrom);
  if (drillDown.dateTo) params.set('date_to', drillDown.dateTo);
  return `/opportunities${params.size ? `?${params.toString()}` : ''}`;
}

export default function AnalyticsScreen({ initialMonth, reportRunId }: {
  initialMonth: { year: number; month: number };
  reportRunId?: string;
}) {
  const router = useRouter();
  const { dashboardData, isLoading, isRefreshing } = useReconciliationData();

  const loading = isLoading || isRefreshing;

  return (
    <>
      <KpiRow findings={dashboardData.findings} loading={loading} error={dashboardData.error} />
      <MonthlyExposureCard initialMonth={initialMonth} />
      <ReportsTab
        findings={dashboardData.findings}
        loading={loading}
        error={dashboardData.error}
        reportRunId={reportRunId}
        onDrillDown={(drillDown: AnalyticsDrillDown) => router.push(opportunitiesHref(drillDown))}
      />
    </>
  );
}
