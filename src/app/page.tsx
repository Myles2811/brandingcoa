import DashboardShell from '@/components/reconciliation/DashboardShell';
import { DashboardData, ReconciliationFindingRecord, ReconciliationRunSummary } from '@/components/reconciliation/types';
import {
  readLatestReconciliationFindingsForMonth,
  readReconciliationFindings,
  resolveReconciliationRun,
} from '@/lib/reconciliation/findingsStore';

export const dynamic = 'force-dynamic';

async function loadDashboardData(requestedRunId?: string): Promise<DashboardData> {
  try {
    const configuredRunId = requestedRunId || process.env.RECONCILIATION_DASHBOARD_RUN_ID;
    const run = await resolveReconciliationRun(configuredRunId || undefined);
    if (!run) return { run: null, findings: [], error: 'No completed reconciliation run was found.' };
    const previousCompleteMonth = new Date();
    previousCompleteMonth.setUTCMonth(previousCompleteMonth.getUTCMonth() - 1, 1);
    const result = configuredRunId
      ? await readReconciliationFindings(run.id, { limit: 500, offset: 0 })
      : await readLatestReconciliationFindingsForMonth(
        previousCompleteMonth.getUTCFullYear(),
        previousCompleteMonth.getUTCMonth() + 1,
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

function previousCompleteMonth() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - 1, 1);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ run_id?: string }> }) {
  const requestedRun = (await searchParams).run_id;
  return <DashboardShell initialData={await loadDashboardData(requestedRun)} initialMonth={previousCompleteMonth()} reportRunId={requestedRun} />;
}
