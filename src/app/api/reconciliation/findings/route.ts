export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { reconciliationAuthError } from '@/lib/reconciliation/auth';
import {
  readReconciliationFindings,
  ReconciliationFindingFilters,
  resolveReconciliationRun,
} from '@/lib/reconciliation/findingsStore';

const CONFIDENCE_TIERS = new Set(['HIGH', 'MEDIUM', 'LOW']);

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : null;
}

function optionalParam(params: URLSearchParams, name: string, maxLength: number): string | null {
  const value = params.get(name)?.trim();
  if (!value) return null;
  return value.length <= maxLength ? value : null;
}

export async function GET(request: NextRequest) {
  const authError = reconciliationAuthError(request);
  if (authError) return authError;

  const params = request.nextUrl.searchParams;
  const limit = boundedInteger(params.get('limit'), 100, 1, 500);
  const offset = boundedInteger(params.get('offset'), 0, 0, 1_000_000);
  const runId = optionalParam(params, 'run_id', 200);
  const findingCode = optionalParam(params, 'finding_code', 80);
  const confidenceParam = optionalParam(params, 'confidence_tier', 20)?.toUpperCase() ?? null;
  const organisation = optionalParam(params, 'organisation', 500);
  const supplier = optionalParam(params, 'supplier', 500);

  if (limit === null || offset === null) {
    return NextResponse.json({ error: 'Invalid limit or offset.' }, { status: 400 });
  }
  if (params.has('run_id') && !runId) {
    return NextResponse.json({ error: 'Invalid run_id.' }, { status: 400 });
  }
  if (params.has('finding_code') && !findingCode) {
    return NextResponse.json({ error: 'Invalid finding_code.' }, { status: 400 });
  }
  if (confidenceParam && !CONFIDENCE_TIERS.has(confidenceParam)) {
    return NextResponse.json({ error: 'confidence_tier must be HIGH, MEDIUM, or LOW.' }, { status: 400 });
  }
  if ((params.has('organisation') && !organisation) || (params.has('supplier') && !supplier)) {
    return NextResponse.json({ error: 'Invalid organisation or supplier filter.' }, { status: 400 });
  }

  try {
    const run = await resolveReconciliationRun(runId ?? undefined);
    if (!run) {
      return NextResponse.json(
        { error: runId ? 'Reconciliation run not found.' : 'No completed reconciliation run found.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const filters: ReconciliationFindingFilters = {
      findingCode: findingCode ?? undefined,
      confidenceTier: confidenceParam as ReconciliationFindingFilters['confidenceTier'] ?? undefined,
      organisation: organisation ?? undefined,
      supplier: supplier ?? undefined,
      limit,
      offset,
    };
    const result = await readReconciliationFindings(run.id, filters);
    return NextResponse.json({
      run,
      filters: {
        finding_code: filters.findingCode ?? null,
        confidence_tier: filters.confidenceTier ?? null,
        organisation: filters.organisation ?? null,
        supplier: filters.supplier ?? null,
      },
      pagination: {
        total: result.total,
        limit,
        offset,
        returned: result.findings.length,
        has_more: offset + result.findings.length < result.total,
      },
      findings: result.findings,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[Reconciliation Findings] Read failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
