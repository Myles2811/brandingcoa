import cron from 'node-cron';
import { getAllSchedules, updateScheduleRun } from './schedulerStore';
import { graph } from './graph';

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  cron.schedule('0 * * * *', () => {
    runScheduledSearches().catch(err =>
      console.error('[Scheduler] Unhandled error:', err)
    );
  });

  console.log('[Scheduler] Cron initialized — will run at the top of every hour');
}

export async function runScheduledSearches() {
  const schedules = await getAllSchedules();
  const active = schedules.filter(s => s.active);
  if (active.length === 0) return;

  console.log(`[Scheduler] Running ${active.length} active schedule(s)`);

  for (const job of active) {
    try {
      await runScheduledJob(job.id, job.year, job.month, {
        frameworkId: job.framework_id,
        useContractsFinderCrossCheck: job.use_contracts_finder,
      });
    } catch (err) {
      console.error(`[Scheduler] Job ${job.id} (${job.year}/${job.month}) failed:`, err);
    }
  }
}

export async function runScheduledJob(
  jobId: number,
  year: number,
  month: number,
  opts: {
    frameworkId?: string;
    useContractsFinderCrossCheck?: boolean;
  }
): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (!apiKey) {
    console.error('[Scheduler] No ANTHROPIC_API_KEY configured — skipping job');
    return 0;
  }

  const result = await graph.invoke({
    year,
    month,
    frameworkId: opts.frameworkId ?? null,
    useContractsFinderCrossCheck: opts.useContractsFinderCrossCheck ?? false,
    allowFallbackScrape: false,
    strictMode: false,
    exclusionListText: '',
    apiKey,
    traceId: '',         // no Langfuse trace for scheduled runs (traceId '' = no-op in nodes)
    searchStartTime: Date.now(),
    storedCandidateIds: [],
    storedRealAwardKeys: [],
    rawNotices: [],
    candidates: [],
    rawCount: 0,
    sourceStatuses: [],
    issues: [],
    complete: true,
    classifiedResults: [],
    rejectedCandidates: [],
    usage: { input: 0, output: 0, cache_creation_input: 0, cache_read_input: 0, total: 0 },
    finalResults: [],
    persistedCount: 0,
    excludedCount: 0,
  });

  const saved = result.finalResults.length;
  if (result.complete) await updateScheduleRun(jobId, saved);

  console.log(`[Scheduler] Job ${jobId} (${year}/${month}): ${saved} new contracts saved; complete=${result.complete}`);
  return saved;
}
