import { Annotation } from '@langchain/langgraph';
import {
  BuyerEvidence, ConfidenceFinding, EntityResolutionResult, EvidenceJudgeResult, ExternalAward,
  FrameworkRateResult,
  ReconciliationCaseOutput, SupplierEvidence,
} from '../types';

export const ReconciliationAnnotation = Annotation.Root({
  runId: Annotation<string>(),
  award: Annotation<ExternalAward>(),
  asOf: Annotation<string>(),
  traceId: Annotation<string>(),

  entityResolution: Annotation<EntityResolutionResult | null>(),
  frameworkRate: Annotation<FrameworkRateResult | null>(),
  buyerEvidence: Annotation<BuyerEvidence | null>(),
  supplierEvidence: Annotation<SupplierEvidence | null>(),
  judgeResult: Annotation<EvidenceJudgeResult | null>(),
  finding: Annotation<ConfidenceFinding | null>(),
  output: Annotation<ReconciliationCaseOutput | null>(),

  buyerAttempts: Annotation<number>(),
  supplierAttempts: Annotation<number>(),
  judgeFlagged: Annotation<boolean>(),
  errors: Annotation<string[]>({ reducer: (current, update) => [...current, ...update], default: () => [] }),
});

export type ReconciliationGraphState = typeof ReconciliationAnnotation.State;
