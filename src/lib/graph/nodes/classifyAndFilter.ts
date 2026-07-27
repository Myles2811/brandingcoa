/**
 * Node 2 — classify_and_filter
 *
 * Responsibilities:
 * - Send candidates to the configured PS awards model in batches (the only LLM call in this graph)
 * - Guardrail 1 (schema validation): reject AI results missing required fields (in classifier)
 * - Guardrail 2 (confidence threshold): move Low-confidence results to rejected list
 * - Guardrail 3 (deduplication guard): check every result against the DB exclusion list —
 *   most critical guard, prevents re-surfacing known awards
 */

import { PSAwardsState } from '../state';
import { classifyNotices } from '../../psAwardClassifier';
import { PSAwardResult, RejectedCandidate } from '../../types';

export async function classifyAndFilter(
  state: PSAwardsState
): Promise<Partial<PSAwardsState>> {
  const { candidates, year, month, exclusionListText, apiKey, strictMode } = state;

  if (candidates.length === 0) {
    return {
      classifiedResults: [],
      rejectedCandidates: [],
      usage: { input: 0, output: 0, cache_creation_input: 0, cache_read_input: 0, total: 0 },
    };
  }

  // AI classification — schema validation and date gate run inside classifyNotices
  const { results: aiResults, rejected: aiRejected, usage, issues, complete } = await classifyNotices(
    candidates,
    year,
    month,
    exclusionListText,
    apiKey
  );

  const passedResults: PSAwardResult[] = [];
  const guardrailRejected: RejectedCandidate[] = [...aiRejected];

  for (const r of aiResults) {
    // Guardrail 2 — Confidence threshold: Low confidence → reject
    if (strictMode && r.confidence !== 'High') {
      guardrailRejected.push({
        notice_id: '',
        buyer_name: r.buyer_name,
        supplier_name: r.supplier_name,
        rejection_reason: 'Strict mode requires High confidence',
        raw_evidence: r.evidence_excerpt.slice(0, 300),
      });
      continue;
    }

    passedResults.push(r);
  }

  return {
    classifiedResults: passedResults,
    rejectedCandidates: guardrailRejected,
    usage,
    issues: [...state.issues, ...issues],
    complete: state.complete && complete,
  };
}
