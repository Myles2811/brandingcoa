export interface SearchRequest {
  year: number;
  month: number;
  frameworkId?: string;
  useContractsFinderCrossCheck?: boolean;
  allowFallbackScrape?: boolean;
  exclusionListText?: string;
  strictMode?: boolean;
}

export interface SearchResponse {
  month: number;
  year: number;
  results: PSAwardResult[];
  raw_count: number;
  qualified_count: number;
  persisted_count: number;
  excluded_count: number;
  complete: boolean;
  issues: RunIssue[];
  usage: RunUsage;
  debug?: RejectedCandidate[];
}

export interface RunIssue {
  stage: string;
  source?: string;
  message: string;
  recoverable: boolean;
}

export interface RunUsage {
  input: number;
  output: number;
  cache_creation_input: number;
  cache_read_input: number;
  total: number;
}

export interface SourceStatus {
  source: NormalizedNotice['source'];
  complete: boolean;
  count: number;
  issues: RunIssue[];
}

export interface SourceFetchResult {
  notices: NormalizedNotice[];
  status: SourceStatus;
}

export interface PSAwardResult {
  candidate_id: string;
  ocid: string;
  release_id: string;
  award_id: string;
  lot_ids: string[];
  contract_ids: string[];
  buyer_name: string;
  supplier_name: string;
  contract_description: string;
  award_date: string;
  publication_date: string;
  award_value: number | null;
  currency: string;
  evidence_excerpt: string;
  confidence: 'High' | 'Medium' | 'Low';
  link: string;
  framework_hints: string[];
  first_seen_timestamp: string;
  source: NormalizedNotice['source'];
}

export interface NormalizedNotice {
  source: 'find_tender' | 'contracts_finder' | 'public_contracts_scotland' | 'sell2wales' | 'etenders_ni';
  candidate_id: string;
  notice_id: string;
  release_id: string;
  award_id: string;
  lot_ids: string[];
  contract_ids: string[];
  ocid: string;
  buyer_name: string;
  supplier_name: string;
  contract_description: string;
  award_date: string;
  publication_date: string;
  award_value: number | null;
  currency: string;
  notice_url: string;
  evidence_text: string;
  framework_hints: string[];
}

export interface RejectedCandidate {
  notice_id: string;
  buyer_name: string;
  supplier_name: string;
  rejection_reason: string;
  raw_evidence: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface HistorySummaryItem {
  year: number;
  month: number;
  count: number;
}

export interface ScheduleJob {
  id: number;
  year: number;
  month: number;
  framework_id: string;
  use_contracts_finder: boolean;
  strict_mode: boolean;
  active: boolean;
  last_run_at: string | null;
  last_run_found: number;
  total_found: number;
  created_at: string;
}
