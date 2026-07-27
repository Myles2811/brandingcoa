import { EvidenceJudgeResult } from '../../types';
import { ReconciliationGraphState } from '../state';
import {
  callForcedTool, nullableString, objectValue, RECONCILIATION_MODELS, reconciliationAnthropicApiKey,
  requiredBoolean, ToolSchema,
} from '../modelCall';
import { EVIDENCE_JUDGE_SYSTEM_PROMPT } from './evidenceJudge.prompt';

const TOOL: ToolSchema = {
  name: 'record_judgement', description: 'Record the evidence quality judgement.',
  input_schema: {
    type: 'object', properties: {
      buyer_evidence_pass: { type: 'boolean' }, buyer_evidence_fail_reason: { type: ['string', 'null'] },
      supplier_evidence_pass: { type: 'boolean' }, supplier_evidence_fail_reason: { type: ['string', 'null'] },
      cross_evidence_conflict: { type: 'boolean' }, cross_evidence_conflict_note: { type: ['string', 'null'] },
    }, required: ['buyer_evidence_pass', 'buyer_evidence_fail_reason', 'supplier_evidence_pass',
      'supplier_evidence_fail_reason', 'cross_evidence_conflict', 'cross_evidence_conflict_note'],
    additionalProperties: false,
  },
};

function parse(value: unknown): EvidenceJudgeResult {
  const record = objectValue(value, 'evidence judgement');
  return {
    buyer_evidence_pass: requiredBoolean(record, 'buyer_evidence_pass'),
    buyer_evidence_fail_reason: nullableString(record, 'buyer_evidence_fail_reason'),
    supplier_evidence_pass: requiredBoolean(record, 'supplier_evidence_pass'),
    supplier_evidence_fail_reason: nullableString(record, 'supplier_evidence_fail_reason'),
    cross_evidence_conflict: requiredBoolean(record, 'cross_evidence_conflict'),
    cross_evidence_conflict_note: nullableString(record, 'cross_evidence_conflict_note'),
  };
}

export async function evidenceJudgeNode(state: ReconciliationGraphState): Promise<Partial<ReconciliationGraphState>> {
  if (!state.buyerEvidence || !state.supplierEvidence) throw new Error('both evidence branches must complete before judging');
  const judgement = await callForcedTool({
    apiKey: reconciliationAnthropicApiKey(), model: RECONCILIATION_MODELS.evidenceJudge,
    system: EVIDENCE_JUDGE_SYSTEM_PROMPT, tool: TOOL,
    audit: { runId: state.runId, awardId: state.award.id, node: 'evidence_judge' },
    input: { buyer_evidence: state.buyerEvidence, supplier_evidence: state.supplierEvidence },
    validate: parse,
  });
  const exhaustedBuyer = !judgement.buyer_evidence_pass && state.buyerAttempts >= 2;
  const exhaustedSupplier = !judgement.supplier_evidence_pass && state.supplierAttempts >= 2;
  return { judgeResult: judgement, judgeFlagged: state.judgeFlagged || exhaustedBuyer || exhaustedSupplier || judgement.cross_evidence_conflict };
}
