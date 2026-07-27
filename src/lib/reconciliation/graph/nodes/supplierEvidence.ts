import { SupplierEvidence } from '../../types';
import { ReconciliationGraphState } from '../state';
import {
  callForcedTool, enumValue, nullableNumber, nullableString, objectValue,
  RECONCILIATION_MODELS, reconciliationAnthropicApiKey, requiredString, ToolSchema,
} from '../modelCall';
import { SUPPLIER_EVIDENCE_SYSTEM_PROMPT } from './supplierEvidence.prompt';
import { loadReconciliationSources } from '../../sourceStore';

const TOOL: ToolSchema = {
  name: 'record_supplier_evidence', description: 'Record supplier-side spend-cycle evidence.',
  input_schema: {
    type: 'object', properties: {
      verdict: { type: 'string', enum: ['ON_SCHEDULE', 'OFF_CYCLE', 'MISSING_FOR_DUE_PERIOD', 'NO_CYCLE_DEFINED'] },
      matched_tab: { type: 'string' }, matched_supplier_row: { type: 'string' },
      last_spend_entry_month: { type: ['string', 'null'] }, last_spend_amount: { type: ['number', 'null'] },
      framework_due_months: { type: ['string', 'null'] }, evidence_excerpt: { type: 'string' },
    }, required: ['verdict', 'matched_tab', 'matched_supplier_row', 'last_spend_entry_month',
      'last_spend_amount', 'framework_due_months', 'evidence_excerpt'], additionalProperties: false,
  },
};

function parse(value: unknown): SupplierEvidence {
  const record = objectValue(value, 'supplier evidence');
  return {
    verdict: enumValue(record, 'verdict', ['ON_SCHEDULE', 'OFF_CYCLE', 'MISSING_FOR_DUE_PERIOD', 'NO_CYCLE_DEFINED']),
    matched_tab: requiredString(record, 'matched_tab'), matched_supplier_row: requiredString(record, 'matched_supplier_row'),
    last_spend_entry_month: nullableString(record, 'last_spend_entry_month'),
    last_spend_amount: nullableNumber(record, 'last_spend_amount'),
    framework_due_months: nullableString(record, 'framework_due_months'),
    evidence_excerpt: requiredString(record, 'evidence_excerpt'),
  };
}

export async function supplierEvidenceNode(state: ReconciliationGraphState): Promise<Partial<ReconciliationGraphState>> {
  const framework = state.frameworkRate?.framework_ref ?? state.award.frameworkReferences[0] ?? null;
  const supplier = state.award.supplierCanonical;
  const { invoiceSpend, frameworkRules } = await loadReconciliationSources(state.runId);
  const candidates = invoiceSpend.filter(record =>
    !framework || record.frameworkReference === framework
  );
  const rules = frameworkRules.filter(rule => !framework || rule.frameworkReference === framework);
  const evidence = await callForcedTool({
    apiKey: reconciliationAnthropicApiKey(), model: RECONCILIATION_MODELS.supplierEvidence,
    system: SUPPLIER_EVIDENCE_SYSTEM_PROMPT, tool: TOOL,
    audit: { runId: state.runId, awardId: state.award.id, node: 'supplier_evidence' },
    input: { supplier: state.award.supplierRaw, supplier_canonical: supplier, framework,
      organisation: state.award.customerRaw, as_of: state.asOf, spend_rows: candidates, framework_rules: rules },
    feedback: state.judgeResult?.supplier_evidence_fail_reason,
    validate(value) {
      const output = parse(value);
      if ((output.verdict === 'ON_SCHEDULE' || output.verdict === 'OFF_CYCLE') && candidates.length === 0) {
        throw new Error('positive supplier verdict has no source spend row');
      }
      return output;
    },
  });
  return { supplierEvidence: evidence, supplierAttempts: state.supplierAttempts + 1 };
}
