export type FindingCode =
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

export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';
export type AwardMatchConfidence = 'High' | 'Medium' | 'Low';
export type PipelineStatus = 'Matched — No Action' | 'Needs Review' | 'Case Opened';
export type CaseStatus = 'New' | 'Investigating' | 'No Rebate Received' | 'Confirmed Missing' | 'Resolved';
export type OpportunityReviewStatus = 'new' | 'acknowledged' | 'in_review' | 'outreach_sent' | 'resolved' | 'not_relevant';

export interface OpportunityNote {
  id: string;
  note: string;
  author: string | null;
  created_at: string;
}

export interface OpportunityReview {
  opportunity_key: string | null;
  status: OpportunityReviewStatus;
  due_now_rebate: number | null;
  updated_by: string | null;
  last_action_at: string | null;
  updated_at: string | null;
  notes: OpportunityNote[];
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

export interface JudgeResult {
  buyer_evidence_pass: boolean;
  buyer_evidence_fail_reason: string | null;
  supplier_evidence_pass: boolean;
  supplier_evidence_fail_reason: string | null;
  cross_evidence_conflict: boolean;
  cross_evidence_conflict_note: string | null;
}

export interface ExternalAwardSummary {
  candidate_id: string;
  source: string | null;
  buyer_name: string | null;
  supplier_name: string | null;
  contract_description: string | null;
  award_date: string | null;
  publication_date: string | null;
  award_value: number | null;
  currency: string | null;
  confidence: AwardMatchConfidence | string | null;
  framework_hints: string[];
  source_url: string | null;
  evidence_excerpt: string | null;
}

export interface ReconciliationFindingRecord {
  id: string;
  run_id: string;
  finding_code: FindingCode;
  framework_reference: string | null;
  supplier_canonical: string | null;
  customer_canonical: string | null;
  expected_spend: number | null;
  reported_spend: number | null;
  expected_rebate: number | null;
  reported_rebate: number | null;
  variance_amount: number | null;
  variance_percent: number | null;
  due_date: string | null;
  is_due: boolean | null;
  deterministic_score: number;
  requires_review: boolean;
  explanation: string;
  external_award_ids: string[];
  rebate_check_record_ids: string[];
  invoice_spend_record_ids: string[];
  framework_rule_ids: string[];
  matched_on: string[];
  conflicts: string[];
  entity_resolution: Record<string, unknown> | null;
  framework_rate: Record<string, unknown> | null;
  buyer_evidence: BuyerEvidence | null;
  supplier_evidence: SupplierEvidence | null;
  judge_result: JudgeResult | null;
  confidence_tier: ConfidenceTier | null;
  judge_flagged: boolean;
  schema_complete: boolean | null;
  case_output: Record<string, unknown> | null;
  award_contract_value: number | null;
  potential_rebate_lifetime_max: number | null;
  evidence_source_references: string[];
  identity_confirmed: boolean | null;
  organisation_display: string | null;
  supplier_display: string | null;
  created_at: string;
  external_awards: ExternalAwardSummary[];
  opportunity_review: OpportunityReview;
}

export interface ReconciliationRunSummary {
  id: string;
  operation: 'run';
  status: 'running' | 'completed' | 'incomplete' | 'failed';
  created_at: string;
  completed_at: string | null;
  external_award_count: number;
  finding_count: number;
  framework_rule_count: number;
  rebate_check_record_count: number;
  invoice_spend_record_count: number;
}

export interface DashboardData {
  run: ReconciliationRunSummary | null;
  findings: ReconciliationFindingRecord[];
  error: string | null;
}
