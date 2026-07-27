import { BuyerEvidence } from '../../types';
import { ReconciliationGraphState } from '../state';
import {
  callForcedTool, enumValue, nullableString, objectValue, RECONCILIATION_MODELS, reconciliationAnthropicApiKey,
  requiredString, ToolSchema,
} from '../modelCall';
import { BUYER_EVIDENCE_SYSTEM_PROMPT } from './buyerEvidence.prompt';
import { loadReconciliationSources } from '../../sourceStore';

const TOOL: ToolSchema = {
  name: 'record_buyer_evidence', description: 'Record buyer-side COA/CAA evidence.',
  input_schema: {
    type: 'object', properties: {
      verdict: { type: 'string', enum: ['COA_CONFIRMED', 'CAA_ONLY', 'NO_RECORD'] },
      matched_tab: { type: ['string', 'null'] }, matched_row_reference: { type: 'string' },
      caa_value: { type: ['string', 'null'] }, coa_value: { type: ['string', 'null'] },
      evidence_excerpt: { type: 'string' }, award_date: { type: ['string', 'null'] },
      expiry_date: { type: ['string', 'null'] }, ambiguity_note: { type: ['string', 'null'] },
    }, required: ['verdict', 'matched_tab', 'matched_row_reference', 'caa_value', 'coa_value',
      'evidence_excerpt', 'award_date', 'expiry_date', 'ambiguity_note'], additionalProperties: false,
  },
};

function parse(value: unknown): BuyerEvidence {
  const record = objectValue(value, 'buyer evidence');
  return {
    verdict: enumValue(record, 'verdict', ['COA_CONFIRMED', 'CAA_ONLY', 'NO_RECORD']),
    matched_tab: nullableString(record, 'matched_tab'), matched_row_reference: requiredString(record, 'matched_row_reference'),
    caa_value: nullableString(record, 'caa_value'), coa_value: nullableString(record, 'coa_value'),
    evidence_excerpt: requiredString(record, 'evidence_excerpt'), award_date: nullableString(record, 'award_date'),
    expiry_date: nullableString(record, 'expiry_date'), ambiguity_note: nullableString(record, 'ambiguity_note'),
  };
}

export async function buyerEvidenceNode(state: ReconciliationGraphState): Promise<Partial<ReconciliationGraphState>> {
  const framework = state.frameworkRate?.framework_ref ?? state.award.frameworkReferences[0] ?? null;
  const organisation = state.award.customerCanonical;
  const { rebateChecks } = await loadReconciliationSources(state.runId);
  const candidates = rebateChecks.filter(record =>
    !framework || record.frameworkReference === framework
  );
  const evidence = await callForcedTool({
    apiKey: reconciliationAnthropicApiKey(), model: RECONCILIATION_MODELS.buyerEvidence,
    system: BUYER_EVIDENCE_SYSTEM_PROMPT, tool: TOOL,
    audit: { runId: state.runId, awardId: state.award.id, node: 'buyer_evidence' },
    input: { organisation: state.award.customerRaw, organisation_canonical: organisation, framework,
      supplier: state.award.supplierRaw, candidate_rows: candidates },
    feedback: state.judgeResult?.buyer_evidence_fail_reason,
    validate(value) {
      const output = parse(value);
      if (output.verdict !== 'NO_RECORD' && candidates.length === 0) throw new Error('positive buyer verdict has no candidate source row');
      if (output.matched_tab && !candidates.some(candidate => candidate.sourceWorksheet === output.matched_tab)) {
        throw new Error('matched buyer tab was not present in candidate rows');
      }
      return output;
    },
  });
  return { buyerEvidence: evidence, buyerAttempts: state.buyerAttempts + 1 };
}
