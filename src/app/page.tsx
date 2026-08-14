import DashboardShell from '@/components/reconciliation/DashboardShell';
import { DashboardData } from '@/components/reconciliation/types';
import { previousCompleteMonth } from '@/lib/laravelApi';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ run_id?: string }> }) {
  const requestedRun = (await searchParams).run_id;
  const defaultMonth = previousCompleteMonth();
  const emptyData: DashboardData = { run: null, findings: [], error: null };

  return <DashboardShell initialData={emptyData} initialMonth={defaultMonth} reportRunId={requestedRun} />;
}
