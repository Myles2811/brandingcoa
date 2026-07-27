export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  readLatestReconciliationFindingsForMonth,
  readReconciliationFindings,
  resolveReconciliationRun,
} from '@/lib/reconciliation/findingsStore';

function boundedMonth(value: string | null): number | null {
  if (!value || !/^\d{1,2}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= 12 ? parsed : null;
}

function boundedYear(value: string | null): number | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 2020 && parsed <= 2100 ? parsed : null;
}

export async function GET(request: NextRequest) {
  try {
    const runId = request.nextUrl.searchParams.get('run_id');
    const year = boundedYear(request.nextUrl.searchParams.get('year'));
    const month = boundedMonth(request.nextUrl.searchParams.get('month'));
    const run = await resolveReconciliationRun(runId || undefined);

    if (!run) return NextResponse.json({ run: null, findings: [], error: 'No completed reconciliation run was found.' });

    const result = runId
      ? await readReconciliationFindings(run.id, { limit: 500, offset: 0 })
      : year && month
        ? await readLatestReconciliationFindingsForMonth(year, month)
        : await readReconciliationFindings(run.id, { limit: 500, offset: 0 });

    return NextResponse.json({
      run,
      findings: result.findings,
      error: null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({
      run: null,
      findings: [],
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
