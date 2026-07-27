export const runtime = 'nodejs';
export const maxDuration = 1800;

import { NextRequest, NextResponse } from 'next/server';
import { SearchRequest, SearchResponse } from '@/lib/types';
import { getLangfuse, isLangfuseEnabled } from '@/lib/langfuseClient';
import { graph } from '@/lib/graph';
import { reconciliationAuthError } from '@/lib/reconciliation/auth';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';

export async function POST(req: NextRequest) {
  const authError = reconciliationAuthError(req);
  if (authError) return authError;
  let body: SearchRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { year, month, useContractsFinderCrossCheck, allowFallbackScrape, strictMode, exclusionListText, frameworkId } = body;

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 });
  }

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured on server' }, { status: 500 });
  }

  const langfuse = getLangfuse();
  const trace = langfuse.trace({
    name: 'ps-awards-search',
    metadata: { year, month, useContractsFinderCrossCheck, frameworkId: frameworkId ?? null },
  });

  try {
    const result = await graph.invoke({
      year,
      month,
      frameworkId: frameworkId ?? null,
      useContractsFinderCrossCheck: useContractsFinderCrossCheck ?? false,
      allowFallbackScrape: allowFallbackScrape ?? false,
      strictMode: strictMode ?? false,
      exclusionListText: exclusionListText ?? '',
      apiKey: ANTHROPIC_API_KEY,
      traceId: isLangfuseEnabled() ? trace.id : '',
      searchStartTime: Date.now(),
      // These are populated by nodes — provide empty defaults
      storedCandidateIds: [],
      storedRealAwardKeys: [],
      rawNotices: [],
      candidates: [],
      rawCount: 0,
      classifiedResults: [],
      rejectedCandidates: [],
      sourceStatuses: [],
      issues: [],
      complete: true,
      usage: { input: 0, output: 0, cache_creation_input: 0, cache_read_input: 0, total: 0 },
      finalResults: [],
      persistedCount: 0,
      excludedCount: 0,
    });

    trace.update({
      output: {
        qualifiedCount: result.finalResults.length,
        excludedCount: result.excludedCount,
        results: result.finalResults,
      },
    });

    const response: SearchResponse = {
      month,
      year,
      results: result.finalResults,
      raw_count: result.rawCount,
      qualified_count: result.finalResults.length,
      persisted_count: result.persistedCount,
      excluded_count: result.excludedCount,
      complete: result.complete,
      issues: result.issues,
      usage: result.usage,
      debug: result.rejectedCandidates,
    };

    return NextResponse.json(response, { status: result.complete ? 200 : 206 });
  } catch (err) {
    trace.update({ output: { error: String(err) } });
    throw err;
  } finally {
    await langfuse.flushAsync();
  }
}
