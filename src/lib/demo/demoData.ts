/**
 * Static demo dataset for the liveDemoTue branch.
 *
 * snapshot.json was captured from the live Postgres reconciliation database by
 * scripts/snapshot-demo-data.mjs. Every screen reads from here instead of the
 * database, so the app builds and runs with no DATABASE_URL, no API routes and
 * no server runtime — which is what lets it deploy to Azure Static Web Apps.
 *
 * Refresh with: node --env-file=.env.local scripts/snapshot-demo-data.mjs
 */
import {
  DashboardData,
  ReconciliationFindingRecord,
  ReconciliationRunSummary,
} from '@/components/reconciliation/types';
import snapshot from './snapshot.json';

interface DemoMonth {
  year: number;
  month: number;
  findings: number;
}

interface DemoSnapshot {
  captured_at: string;
  default_month: { year: number; month: number };
  headline_run_id: string;
  runs: ReconciliationRunSummary[];
  run_findings: Record<string, ReconciliationFindingRecord[]>;
  months: DemoMonth[];
  month_findings: Record<string, ReconciliationFindingRecord[]>;
  schedules: Record<string, unknown>[];
}

const demo = snapshot as unknown as DemoSnapshot;

export const demoCapturedAt = demo.captured_at;
export const demoDefaultMonth = demo.default_month;
export const demoRuns = demo.runs;
export const demoMonths = demo.months;
export const demoSchedules = demo.schedules;

/** The run the demo leads with — the richest snapshot, so no panel looks empty. */
export const demoHeadlineRun: ReconciliationRunSummary | null =
  demo.runs.find(run => run.id === demo.headline_run_id) ?? demo.runs[0] ?? null;

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Newest month that actually carries findings — used when the snapshot has drifted. */
function firstPopulatedMonth(): DemoMonth | null {
  return [...demo.months].sort((a, b) => b.findings - a.findings)[0] ?? null;
}

export function demoRunById(runId: string | undefined): ReconciliationRunSummary | null {
  if (!runId) return demoHeadlineRun;
  return demo.runs.find(run => run.id === runId) ?? null;
}

/** Mirrors the old GET /api/reconciliation/dashboard?run_id= response. */
export function demoDataForRun(runId?: string): DashboardData {
  const run = demoRunById(runId);
  if (!run) return { run: null, findings: [], error: 'No completed reconciliation run was found.' };
  return { run, findings: demo.run_findings[run.id] ?? [], error: null };
}

/** Mirrors the old GET /api/reconciliation/dashboard?year=&month= response. */
export function demoDataForMonth(year: number, month: number): DashboardData {
  const findings = demo.month_findings[monthKey(year, month)] ?? [];
  return { run: demoHeadlineRun, findings, error: null };
}

/** The payload page.tsx used to load server-side from Postgres. */
export function demoInitialData(runId?: string): DashboardData {
  if (runId) return demoDataForRun(runId);
  const month = demoDefaultMonth;
  const forMonth = demoDataForMonth(month.year, month.month);
  if (forMonth.findings.length > 0) return forMonth;
  const fallback = firstPopulatedMonth();
  return fallback ? demoDataForMonth(fallback.year, fallback.month) : demoDataForRun();
}

/** Anchor month for the month pickers — the newest month present in the snapshot. */
export function demoAnchorMonth(): { year: number; month: number } {
  const newest = [...demo.months].sort((a, b) => (b.year - a.year) || (b.month - a.month))[0];
  return newest ? { year: newest.year, month: newest.month } : demoDefaultMonth;
}
