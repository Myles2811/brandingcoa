import { FrameworkRateResult, FrameworkRule } from '../../types';
import { calculateRebate } from '../../matching/rebateCalculator';
import { ReconciliationGraphState } from '../state';
import {
  callForcedTool, enumValue, nullableNumber, nullableString, objectValue,
  RECONCILIATION_MODELS, reconciliationAnthropicApiKey, requiredString, ToolSchema,
} from '../modelCall';
import { FRAMEWORK_RATE_LOOKUP_SYSTEM_PROMPT } from './frameworkRateLookup.prompt';
import { loadReconciliationSources } from '../../sourceStore';

const CALCULATE_REBATE_TOOL: ToolSchema = {
  name: 'calculate_rebate', description: 'Calculate award value multiplied by an exact source rebate rate.',
  input_schema: {
    type: 'object', properties: {
      award_value: { type: 'number' }, rebate_rate_decimal: { type: 'number' },
    }, required: ['award_value', 'rebate_rate_decimal'], additionalProperties: false,
  },
};

const RECORD_RATE_TOOL: ToolSchema = {
  name: 'record_framework_rate', description: 'Record the framework rate lookup result.',
  input_schema: {
    type: 'object', properties: {
      framework_ref: { type: ['string', 'null'] }, matched_row_reference: { type: 'string' },
      match_method: { type: 'string', enum: ['framework_ref', 'official_name', 'pipeline_name', 'ambiguous'] },
      rate_status: { type: 'string', enum: ['FOUND', 'PENDING_RATE', 'NOT_FOUND', 'AMBIGUOUS'] },
      rebate_rate_pct: { type: ['number', 'null'] }, potential_rebate_lifetime_max: { type: ['number', 'null'] },
      validity_start: { type: ['string', 'null'] }, validity_end: { type: ['string', 'null'] },
      award_outside_validity_window: { type: ['boolean', 'null'] },
    }, required: ['framework_ref', 'matched_row_reference', 'match_method', 'rate_status', 'rebate_rate_pct',
      'potential_rebate_lifetime_max', 'validity_start', 'validity_end', 'award_outside_validity_window'],
    additionalProperties: false,
  },
};

function parseRate(value: unknown): Omit<FrameworkRateResult, 'calculation_tool_invoked'> {
  const record = objectValue(value, 'framework rate');
  const outside = record.award_outside_validity_window;
  if (outside !== null && typeof outside !== 'boolean') throw new Error('award_outside_validity_window must be boolean or null');
  return {
    framework_ref: nullableString(record, 'framework_ref'),
    matched_row_reference: requiredString(record, 'matched_row_reference'),
    match_method: enumValue(record, 'match_method', ['framework_ref', 'official_name', 'pipeline_name', 'ambiguous']),
    rate_status: enumValue(record, 'rate_status', ['FOUND', 'PENDING_RATE', 'NOT_FOUND', 'AMBIGUOUS']),
    rebate_rate_pct: nullableNumber(record, 'rebate_rate_pct'),
    potential_rebate_lifetime_max: nullableNumber(record, 'potential_rebate_lifetime_max'),
    validity_start: nullableString(record, 'validity_start'), validity_end: nullableString(record, 'validity_end'),
    award_outside_validity_window: outside as boolean | null,
  };
}

export function selectFrameworkRuleCandidates(
  rules: FrameworkRule[],
  reference: string | null,
  name: string | null,
): FrameworkRule[] {
  const exactReference = reference ? rules.filter(rule => rule.frameworkReference === reference) : [];
  if (exactReference.length > 0) return exactReference;
  return name ? rules.filter(rule => rule.frameworkName === name) : [];
}

export async function frameworkRateLookupNode(state: ReconciliationGraphState): Promise<Partial<ReconciliationGraphState>> {
  const { frameworkRules } = await loadReconciliationSources(state.runId);
  const frameworkReference = state.award.frameworkReferences[0] ?? null;
  const candidates = frameworkReference
    ? selectFrameworkRuleCandidates(frameworkRules, frameworkReference, null)
    : frameworkRules;
  const usable = candidates.length === 1 && candidates[0].rebateRate !== 'TBC' ? candidates[0] : null;
  let calculated: number | null = null;
  let calculationToolInvoked = false;
  if (usable && state.award.awardValue !== null) {
    const awardValue = Number(state.award.awardValue);
    const rate = Number(usable.rebateRate);
    const args = await callForcedTool({
      apiKey: reconciliationAnthropicApiKey(), model: RECONCILIATION_MODELS.frameworkRateLookup,
      system: FRAMEWORK_RATE_LOOKUP_SYSTEM_PROMPT, tool: CALCULATE_REBATE_TOOL,
      audit: { runId: state.runId, awardId: state.award.id, node: 'framework_rate_lookup.calculate_rebate' },
      input: { award_framework_references: state.award.frameworkReferences, award_title: state.award.title,
        award_evidence: state.award.evidence, matched_rule: usable, award_value: awardValue },
      validate(value) {
        const record = objectValue(value, 'calculate_rebate arguments');
        const returnedAward = nullableNumber(record, 'award_value');
        const returnedRate = nullableNumber(record, 'rebate_rate_decimal');
        if (returnedAward !== awardValue || returnedRate !== rate) throw new Error('calculation tool arguments differ from authoritative source values');
        return { awardValue: returnedAward, rate: returnedRate };
      },
    });
    calculated = Number(calculateRebate(String(args.awardValue), String(args.rate)));
    calculationToolInvoked = true;
  }
  const parsed = await callForcedTool({
    apiKey: reconciliationAnthropicApiKey(), model: RECONCILIATION_MODELS.frameworkRateLookup,
    system: FRAMEWORK_RATE_LOOKUP_SYSTEM_PROMPT, tool: RECORD_RATE_TOOL,
    audit: { runId: state.runId, awardId: state.award.id, node: 'framework_rate_lookup' },
    input: { award_framework_references: state.award.frameworkReferences, candidate_rows: candidates, award: state.award,
      calculation_tool_result: calculated }, validate: parseRate,
  });
  if (parsed.potential_rebate_lifetime_max !== null && !calculationToolInvoked) parsed.potential_rebate_lifetime_max = null;
  if (calculationToolInvoked && parsed.rate_status === 'FOUND') parsed.potential_rebate_lifetime_max = calculated;
  const result: FrameworkRateResult = { ...parsed, calculation_tool_invoked: calculationToolInvoked };
  if (result.rate_status === 'PENDING_RATE') {
    return { frameworkRate: result, finding: {
      finding_code: 'PENDING_RATE', confidence_tier: 'MEDIUM', potential_rebate_lifetime_max: null,
      reasoning_summary: 'The framework rebate rate is pending and no financial estimate was made.',
    } };
  }
  return { frameworkRate: result };
}
