export type ReconciliationFinding =
  | 'MATCHED'
  | 'EXTERNAL_AWARD_MISSING_REBATE_LOG'
  | 'COA_NO_SUPPLIER_SPEND'
  | 'SUPPLIER_SPEND_UNMATCHED'
  | 'REBATE_VALUE_MISMATCH'
  | 'NOT_YET_DUE'
  | 'AMBIGUOUS_MATCH'
  | 'NEEDS_MANUAL_REVIEW'
  | 'PENDING_RATE'
  | 'INVALID_SOURCE_DATA';

export interface EntityIdentityMatch {
  input: string;
  resolved: string | null;
  similarity: number;
}

export interface EntityResolutionResult {
  framework: EntityIdentityMatch & { reference: string | null; name: string | null };
  supplier: EntityIdentityMatch;
  organisation: EntityIdentityMatch;
  overallSimilarity: number;
  threshold: number;
  needsManualReview: boolean;
}

export interface FrameworkRateResult {
  framework_ref: string | null;
  matched_row_reference: string;
  match_method: 'framework_ref' | 'official_name' | 'pipeline_name' | 'ambiguous';
  rate_status: 'FOUND' | 'PENDING_RATE' | 'NOT_FOUND' | 'AMBIGUOUS';
  rebate_rate_pct: number | null;
  potential_rebate_lifetime_max: number | null;
  validity_start: string | null;
  validity_end: string | null;
  award_outside_validity_window: boolean | null;
  calculation_tool_invoked: boolean;
}

export interface BuyerEvidence {
  verdict: 'COA_CONFIRMED' | 'CAA_ONLY' | 'NO_RECORD';
  matched_tab: string | null;
  matched_row_reference: string;
  caa_value: string | null;
  coa_value: string | null;
  evidence_excerpt: string;
  award_date: string | null;
  expiry_date: string | null;
  ambiguity_note: string | null;
}

export interface SupplierEvidence {
  verdict: 'ON_SCHEDULE' | 'OFF_CYCLE' | 'MISSING_FOR_DUE_PERIOD' | 'NO_CYCLE_DEFINED';
  matched_tab: string;
  matched_supplier_row: string;
  last_spend_entry_month: string | null;
  last_spend_amount: number | null;
  framework_due_months: string | null;
  evidence_excerpt: string;
}

export interface EvidenceJudgeResult {
  buyer_evidence_pass: boolean;
  buyer_evidence_fail_reason: string | null;
  supplier_evidence_pass: boolean;
  supplier_evidence_fail_reason: string | null;
  cross_evidence_conflict: boolean;
  cross_evidence_conflict_note: string | null;
}

export interface ConfidenceFinding {
  finding_code: 'MATCHED' | 'COA_NO_SUPPLIER_SPEND' | 'EXTERNAL_AWARD_MISSING_REBATE_LOG' | 'SUPPLIER_SPEND_UNMATCHED' | 'AMBIGUOUS_MATCH' | 'NEEDS_MANUAL_REVIEW' | 'PENDING_RATE';
  confidence_tier: 'HIGH' | 'MEDIUM' | 'LOW';
  potential_rebate_lifetime_max: number | null;
  reasoning_summary: string;
}

export interface ReconciliationCaseOutput {
  organisation: string | null;
  supplier: string | null;
  framework_ref: string | null;
  award_type: string | null;
  award_contract_value: number | null;
  potential_rebate_lifetime_max: number | null;
  finding_code: ConfidenceFinding['finding_code'];
  confidence_tier: ConfidenceFinding['confidence_tier'];
  buyer_evidence: BuyerEvidence | null;
  supplier_evidence: SupplierEvidence | null;
  judge_result: EvidenceJudgeResult | null;
  evidence_source_references: string[];
  schema_complete: boolean;
  missing_fields: string[];
  judge_flagged: boolean;
  identity_confirmed: boolean;
}

export interface SourceLineage {
  sourceSnapshotId: string;
  sourceWorksheet: string;
  sourceRow: number;
}

export interface FrameworkRule extends SourceLineage {
  id: string;
  frameworkReference: string;
  frameworkName: string;
  category: string | null;
  rebateRate: string;
  validFrom: string | null;
  validTo: string | null;
  reportingFrequency: 'monthly' | 'quarterly' | 'annual' | 'unknown';
  reportingLagDays: number | null;
  graceDays: number;
}

export interface RebateCheckRecord extends SourceLineage {
  id: string;
  externalReference: string | null;
  customerRaw: string;
  customerCanonical: string;
  supplierRaw: string;
  supplierCanonical: string;
  frameworkRaw: string;
  frameworkReference: string | null;
  coaStatus: string | null;
  caaStatus: string | null;
  rebateStatus: string | null;
  orderValue: string | null;
  expectedRebate: string | null;
  notes: string | null;
  awardDate: string | null;
}

export interface InvoiceSpendRecord extends SourceLineage {
  id: string;
  supplierRaw: string;
  supplierCanonical: string;
  customerRaw: string | null;
  customerCanonical: string | null;
  frameworkRaw: string;
  frameworkReference: string | null;
  category: string | null;
  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;
  spendAmount: string;
  reportedRebate: string | null;
  invoiceStatus: string | null;
  invoiceReference: string | null;
  comments: string | null;
}

export interface ExternalAward {
  id: string;
  source: string;
  ocid: string | null;
  releaseId: string;
  awardId: string;
  lotIds: string[];
  contractIds: string[];
  customerRaw: string;
  customerCanonical: string;
  supplierRaw: string;
  supplierCanonical: string;
  frameworkReferences: string[];
  title: string;
  awardDate: string | null;
  publicationDate: string;
  awardValue: string | null;
  currency: string;
  confidence: 'High' | 'Medium' | 'Low';
  evidence: string;
  sourceUrl: string;
}

export interface ValidationIssue {
  workbook: 'framework_rules' | 'rebate_check_log' | 'invoice_spreadsheet' | 'external_awards';
  worksheet?: string;
  row?: number;
  code: string;
  message: string;
  fatal: boolean;
}

export interface WorkbookMetadata {
  itemId: string;
  name: string;
  eTag: string | null;
  lastModifiedDateTime: string | null;
  size: number | null;
  snapshotId: string;
}

export interface ParsedWorkbook<T> {
  metadata: WorkbookMetadata;
  records: T[];
  issues: ValidationIssue[];
  worksheets: string[];
}
