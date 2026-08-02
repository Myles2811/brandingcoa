import DashboardShell from '@/components/reconciliation/DashboardShell';
import { DashboardData, ReconciliationFindingRecord, ReconciliationRunSummary } from '@/components/reconciliation/types';
import {
  readLatestReconciliationFindingsForMonth,
  readReconciliationFindings,
  resolveDefaultDashboardMonth,
  resolveReconciliationRun,
} from '@/lib/reconciliation/findingsStore';

export const dynamic = 'force-dynamic';

async function loadDashboardData(requestedRunId: string | undefined, defaultMonth: { year: number; month: number }): Promise<DashboardData> {
  try {
    const configuredRunId = requestedRunId || process.env.RECONCILIATION_DASHBOARD_RUN_ID;
    const run = await resolveReconciliationRun(configuredRunId || undefined);
    if (!run) return { run: null, findings: [], error: 'No completed reconciliation run was found.' };
    const result = configuredRunId
      ? await readReconciliationFindings(run.id, { limit: 500, offset: 0 })
      : await readLatestReconciliationFindingsForMonth(
        defaultMonth.year,
        defaultMonth.month,
      );
    return JSON.parse(JSON.stringify({
      run: run as unknown as ReconciliationRunSummary,
      findings: result.findings as unknown as ReconciliationFindingRecord[],
      error: null,
    })) as DashboardData;
  } catch (error) {
    return { run: null, findings: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export default async function Home({ searchParams }: { searchParams: Promise<{ run_id?: string }> }) {
  const requestedRun = (await searchParams).run_id;
  const defaultMonth = await resolveDefaultDashboardMonth();
  return <DashboardShell initialData={await loadDashboardData(requestedRun, defaultMonth)} initialMonth={defaultMonth} reportRunId={requestedRun} />;
}
