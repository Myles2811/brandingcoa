import { ReconciliationCaseOutput } from '../../types';
import { ReconciliationGraphState } from '../state';
import {
  callForcedTool, enumValue, nullableNumber, nullableString, objectValue,
  RECONCILIATION_MODELS, reconciliationAnthropicApiKey, requiredBoolean, ToolSchema,
} from '../modelCall';
import { STRUCTURED_OUTPUT_SYSTEM_PROMPT } from './structuredOutput.prompt';

const TOOL: ToolSchema = {
  name: 'record_case_output', description: 'Record the final strict reconciliation case output.',
  input_schema: {
    type: 'object', properties: {
      organisation: { type: ['string', 'null'] }, supplier: { type: ['string', 'null'] },
      framework_ref: { type: ['string', 'null'] }, award_type: { type: ['string', 'null'] },
      award_contract_value: { type: ['number', 'null'] }, potential_rebate_lifetime_max: { type: ['number', 'null'] },
      finding_code: { type: 'string', enum: ['MATCHED', 'COA_NO_SUPPLIER_SPEND', 'EXTERNAL_AWARD_MISSING_REBATE_LOG', 'SUPPLIER_SPEND_UNMATCHED', 'AMBIGUOUS_MATCH', 'NEEDS_MANUAL_REVIEW', 'PENDING_RATE'] },
      confidence_tier: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
      buyer_evidence: { type: ['object', 'null'] }, supplier_evidence: { type: ['object', 'null'] },
      judge_result: { type: ['object', 'null'] }, evidence_source_references: { type: 'array', items: { type: 'string' } },
      schema_complete: { type: 'boolean' }, missing_fields: { type: 'array', items: { type: 'string' } },
      identity_confirmed: { type: 'boolean' },
    }, required: ['organisation', 'supplier', 'framework_ref', 'award_type', 'award_contract_value',
      'potential_rebate_lifetime_max', 'finding_code', 'confidence_tier', 'buyer_evidence', 'supplier_evidence',
      'judge_result', 'evidence_source_references', 'schema_complete', 'missing_fields', 'identity_confirmed'], additionalProperties: false,
  },
};

export async function structuredOutputNode(state: ReconciliationGraphState): Promise<Partial<ReconciliationGraphState>> {
  if (!state.finding) throw new Error('finding is missing');
  const authoritative = authoritativeCaseInput(state);
  const output = await callForcedTool({
    apiKey: reconciliationAnthropicApiKey(), model: RECONCILIATION_MODELS.structuredOutput,
    system: STRUCTURED_OUTPUT_SYSTEM_PROMPT, tool: TOOL, input: authoritative,
    audit: { runId: state.runId, awardId: state.award.id, node: 'structured_output' },
    validate(value) {
      const record = objectValue(value, 'case output');
      const parsed: ReconciliationCaseOutput = {
        organisation: nullableString(record, 'organisation'), supplier: nullableString(record, 'supplier'),
        framework_ref: nullableString(record, 'framework_ref'), award_type: nullableString(record, 'award_type'),
        award_contract_value: nullableNumber(record, 'award_contract_value'),
        potential_rebate_lifetime_max: nullableNumber(record, 'potential_rebate_lifetime_max'),
        finding_code: enumValue(record, 'finding_code', ['MATCHED', 'COA_NO_SUPPLIER_SPEND', 'EXTERNAL_AWARD_MISSING_REBATE_LOG', 'SUPPLIER_SPEND_UNMATCHED', 'AMBIGUOUS_MATCH', 'NEEDS_MANUAL_REVIEW', 'PENDING_RATE']),
        confidence_tier: enumValue(record, 'confidence_tier', ['HIGH', 'MEDIUM', 'LOW']),
        buyer_evidence: record.buyer_evidence as ReconciliationCaseOutput['buyer_evidence'],
        supplier_evidence: record.supplier_evidence as ReconciliationCaseOutput['supplier_evidence'],
        judge_result: record.judge_result as ReconciliationCaseOutput['judge_result'],
        evidence_source_references: Array.isArray(record.evidence_source_references) && record.evidence_source_references.every(item => typeof item === 'string') ? record.evidence_source_references : (() => { throw new Error('invalid evidence_source_references'); })(),
        schema_complete: requiredBoolean(record, 'schema_complete'),
        missing_fields: Array.isArray(record.missing_fields) && record.missing_fields.every(item => typeof item === 'string') ? record.missing_fields : (() => { throw new Error('invalid missing_fields'); })(),
        judge_flagged: state.judgeFlagged,
        identity_confirmed: requiredBoolean(record, 'identity_confirmed'),
      };
      for (const field of ['organisation', 'supplier', 'framework_ref', 'award_type', 'award_contract_value', 'potential_rebate_lifetime_max', 'finding_code', 'confidence_tier', 'buyer_evidence', 'supplier_evidence', 'judge_result', 'identity_confirmed'] as const) {
        if (JSON.stringify(parsed[field]) !== JSON.stringify(authoritative[field])) throw new Error(`structured output altered ${field}`);
      }
      return parsed;
    },
  });
  return { output };
}

export function authoritativeCaseInput(state: ReconciliationGraphState) {
  if (!state.finding) throw new Error('finding is missing');
  return {
    organisation: state.award.customerRaw,
    supplier: state.award.supplierRaw,
    framework_ref: state.frameworkRate?.framework_ref ?? state.award.frameworkReferences[0] ?? null,
    award_type: state.award.source || null,
    award_contract_value: state.award.awardValue === null ? null : Number(state.award.awardValue),
    potential_rebate_lifetime_max: state.finding.potential_rebate_lifetime_max,
    finding_code: state.finding.finding_code,
    confidence_tier: state.finding.confidence_tier,
    buyer_evidence: state.buyerEvidence,
    supplier_evidence: state.supplierEvidence,
    judge_result: state.judgeResult,
    evidence_source_references: [
      state.frameworkRate?.matched_row_reference,
      state.buyerEvidence?.matched_row_reference,
      state.supplierEvidence?.matched_supplier_row,
    ].filter((value): value is string => !!value),
    identity_confirmed: true,
  };
}
