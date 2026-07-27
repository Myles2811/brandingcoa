/**
 * Node 3 — persist_results
 *
 * Responsibilities:
 * - Remove results already stored in the contracts table for this month
 * - Final deduplication pass
 * - Save new contracts to the contracts table
 * - Record the run to the Langfuse evaluation dataset and attach trace scores
 */

import { PSAwardsState } from '../state';
import { deduplicateResults } from '../../dedupeEngine';
import { saveContracts } from '../../contractsStore';
import { addRunToDataset, calcCostUsd } from '../../langfuseEval';
import { saveSearchRun } from '../../searchRunStore';

export async function persistResults(
  state: PSAwardsState
): Promise<Partial<PSAwardsState>> {
  const {
    year, month, frameworkId, useContractsFinderCrossCheck,
    classifiedResults, rejectedCandidates, usage,
    traceId, searchStartTime, rawCount, storedCandidateIds,
  } = state;

  // Remove results already stored for this month
  const storedIds = new Set(storedCandidateIds);
  const notYetStored = classifiedResults.filter(r => !storedIds.has(r.candidate_id));
  const alreadyStoredCount = classifiedResults.length - notYetStored.length;

  // Final deduplication
  const finalResults = deduplicateResults(notYetStored);
  const excludedCount = alreadyStoredCount;

  // Persist to DB ──────────────────────────────────────────────────────────────
  const persistedCount = finalResults.length > 0 ? await saveContracts(year, month, finalResults) : 0;

  await saveSearchRun(state, finalResults.length, excludedCount);

  // Langfuse evaluation ────────────────────────────────────────────────────────
  if (traceId) {
    const elapsedSeconds = (Date.now() - searchStartTime) / 1000;
    const costUsd = calcCostUsd(usage.input, usage.output);

    addRunToDataset(
      { year, month, frameworkId: frameworkId ?? null, useContractsFinderCrossCheck },
      { qualifiedCount: finalResults.length, excludedCount, results: finalResults },
      {
        traceId,
        latencySeconds: elapsedSeconds,
        promptTokens: usage.input,
        completionTokens: usage.output,
        totalTokens: usage.total,
        costUsd,
      }
    ).catch(err => console.error('[Eval] addRunToDataset failed:', err));
  }

  console.log(
    `[Graph] Run complete — raw: ${rawCount}, classified: ${classifiedResults.length}, ` +
    `new: ${finalResults.length}, excluded: ${excludedCount}, ` +
    `rejected: ${rejectedCandidates.length}`
  );

  return { finalResults, persistedCount, excludedCount };
}
