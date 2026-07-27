import { Annotation } from '@langchain/langgraph';
import { NormalizedNotice, PSAwardResult, RejectedCandidate, RunIssue, SourceStatus } from '../types';
import { ClassifyUsage } from '../psAwardClassifier';

export const PSAwardsAnnotation = Annotation.Root({
  // ── Run inputs (set at graph entry, never mutated) ─────────────────────────
  year: Annotation<number>(),
  month: Annotation<number>(),
  frameworkId: Annotation<string | null>(),
  useContractsFinderCrossCheck: Annotation<boolean>(),
  allowFallbackScrape: Annotation<boolean>(),
  strictMode: Annotation<boolean>(),
  exclusionListText: Annotation<string>(),    // extra manual exclusions for AI prompt (optional)
  apiKey: Annotation<string>(),
  traceId: Annotation<string>(),
  searchStartTime: Annotation<number>(),

  // ── Persistent state loaded from DB at run start ────────────────────────────
  storedCandidateIds: Annotation<string[]>(),
  storedRealAwardKeys: Annotation<string[]>(),

  // ── Intermediate state (set by fetchNotices) ────────────────────────────────
  rawNotices: Annotation<NormalizedNotice[]>(),
  candidates: Annotation<NormalizedNotice[]>(),
  rawCount: Annotation<number>(),
  sourceStatuses: Annotation<SourceStatus[]>(),
  issues: Annotation<RunIssue[]>(),
  complete: Annotation<boolean>(),

  // ── AI output (set by classifyAndFilter) ───────────────────────────────────
  classifiedResults: Annotation<PSAwardResult[]>(),
  rejectedCandidates: Annotation<RejectedCandidate[]>(),
  usage: Annotation<ClassifyUsage>(),

  // ── Final output (set by persistResults) ───────────────────────────────────
  finalResults: Annotation<PSAwardResult[]>(),
  persistedCount: Annotation<number>(),
  excludedCount: Annotation<number>(),
});

export type PSAwardsState = typeof PSAwardsAnnotation.State;
