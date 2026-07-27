import { ConfidenceFinding } from '../../types';
import { ReconciliationGraphState } from '../state';
import {
  callForcedTool, enumValue, nullableNumber, objectValue, RECONCILIATION_MODELS, reconciliationAnthropicApiKey,
  requiredString, ToolSchema,
} from '../modelCall';
import { CONFIDENCE_AND_FINDING_SYSTEM_PROMPT } from './confidenceAndFinding.prompt';

const TOOL: ToolSchema = {
  name: 'record_finding', description: 'Record the final finding and confidence tier.',
  input_schema: {
    type: 'object', properties: {
      finding_code: { type: 'string', enum: ['MATCHED', 'COA_NO_SUPPLIER_SPEND', 'EXTERNAL_AWARD_MISSING_REBATE_LOG', 'SUPPLIER_SPEND_UNMATCHED', 'AMBIGUOUS_MATCH', 'PENDING_RATE'] },
      confidence_tier: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
      potential_rebate_lifetime_max: { type: ['number', 'null'] }, reasoning_summary: { type: 'string' },
    }, required: ['finding_code', 'confidence_tier', 'potential_rebate_lifetime_max', 'reasoning_summary'],
    additionalProperties: false,
  },
};

function parse(value: unknown): ConfidenceFinding {
  const record = objectValue(value, 'finding');
  return {
    finding_code: enumValue(record, 'finding_code', ['MATCHED', 'COA_NO_SUPPLIER_SPEND', 'EXTERNAL_AWARD_MISSING_REBATE_LOG', 'SUPPLIER_SPEND_UNMATCHED', 'AMBIGUOUS_MATCH', 'PENDING_RATE']),
    confidence_tier: enumValue(record, 'confidence_tier', ['HIGH', 'MEDIUM', 'LOW']),
    potential_rebate_lifetime_max: nullableNumber(record, 'potential_rebate_lifetime_max'),
    reasoning_summary: requiredString(record, 'reasoning_summary'),
  };
}

export async function confidenceAndFindingNode(state: ReconciliationGraphState): Promise<Partial<ReconciliationGraphState>> {
  if (!state.buyerEvidence || !state.supplierEvidence || !state.judgeResult) throw new Error('verified evidence is missing');
  const expectedPotential = state.frameworkRate?.potential_rebate_lifetime_max ?? null;
  const finding = await callForcedTool({
    apiKey: reconciliationAnthropicApiKey(), model: RECONCILIATION_MODELS.confidenceAndFinding,
    system: CONFIDENCE_AND_FINDING_SYSTEM_PROMPT, tool: TOOL,
    audit: { runId: state.runId, awardId: state.award.id, node: 'confidence_and_finding' },
    input: { buyer_evidence: state.buyerEvidence, supplier_evidence: state.supplierEvidence,
      judge_result: state.judgeResult, judge_flagged: state.judgeFlagged, framework_rate: state.frameworkRate },
    validate(value) {
      const output = parse(value);
      if (output.potential_rebate_lifetime_max !== expectedPotential) throw new Error('finding altered the upstream potential rebate');
      if (output.finding_code === 'MATCHED' &&
        (output.confidence_tier !== 'HIGH' || state.buyerEvidence?.verdict !== 'COA_CONFIRMED' || state.supplierEvidence?.verdict !== 'ON_SCHEDULE')) {
        throw new Error('MATCHED hard gate requires HIGH, COA_CONFIRMED and ON_SCHEDULE');
      }
      return output;
    },
  });
  return { finding };
}
