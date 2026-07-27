/**
 * Node 1 — fetch_notices
 *
 * Responsibilities:
 * - Load exact stored award identities from the contracts table
 * - Fetch raw notices from Find a Tender (always) + Contracts Finder (optional)
 * - Apply framework ID pre-filter if provided
 * - Deduplicate candidates before handing off to AI
 */

import { PSAwardsState } from '../state';
import { fetchFindTenderNoticesDetailed } from '../../findTenderAdapter';
import { fetchContractsFinderNoticesDetailed } from '../../contractsFinderAdapter';
import { fetchPublicContractsScotlandAwardsDetailed } from '../../publicContractsScotlandAdapter';
import { fetchSell2WalesAwardsDetailed } from '../../sell2WalesAdapter';
import { fetchETendersNIAwardsDetailed } from '../../eTendersNIAdapter';
import { deduplicateNotices } from '../../dedupeEngine';
import { buildDateRange } from '../../dateRangeBuilder';
import { getStoredCandidateIds, getStoredRealAwardKeys } from '../../contractsStore';
import { realAwardKey } from '../../awardIdentity';

export async function fetchNotices(
  state: PSAwardsState
): Promise<Partial<PSAwardsState>> {
  const { year, month, frameworkId, useContractsFinderCrossCheck, allowFallbackScrape } = state;

  const range = buildDateRange(year, month);

  // Load persistent state from DB ─────────────────────────────────────────────
  const [storedCandidateIds, storedRealAwardKeys] = await Promise.all([
    getStoredCandidateIds(), getStoredRealAwardKeys(),
  ]);

  // Fetch notices ──────────────────────────────────────────────────────────────
  const sourceResults = await Promise.all([
    fetchFindTenderNoticesDetailed(range),
    fetchPublicContractsScotlandAwardsDetailed(range),
    fetchSell2WalesAwardsDetailed(range),
  ]);

  if (useContractsFinderCrossCheck) {
    sourceResults.push(await fetchContractsFinderNoticesDetailed(range));
  }
  if (allowFallbackScrape) {
    sourceResults.push(await fetchETendersNIAwardsDetailed(range));
  }

  const rawNotices = sourceResults.flatMap(result => result.notices);
  const sourceStatuses = sourceResults.map(result => result.status);
  const issues = sourceStatuses.flatMap(status => status.issues);

  const rawCount = rawNotices.length;

  // Framework ID pre-filter ───────────────────────────────────────────────────
  let candidates = rawNotices;
  if (frameworkId?.trim()) {
    const fwUpper = frameworkId.trim().toUpperCase();
    candidates = candidates.filter(
      n =>
        n.evidence_text.toUpperCase().includes(fwUpper) ||
        n.framework_hints.some(h => h.toUpperCase().includes(fwUpper))
    );
  }

  // Deduplicate before AI ─────────────────────────────────────────────────────
  const deduped = deduplicateNotices(candidates).filter(notice => !storedRealAwardKeys.has(realAwardKey(notice)));

  return {
    storedCandidateIds: [...storedCandidateIds],
    storedRealAwardKeys: [...storedRealAwardKeys],
    rawNotices,
    rawCount,
    candidates: deduped,
    sourceStatuses,
    issues,
    complete: issues.length === 0,
  };
}
