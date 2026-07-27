import { getLangfuse, isLangfuseEnabled } from './langfuseClient';
import { PSAwardResult } from './types';

// ─── Pricing constants for claude-haiku-4-5-20251001 ──────────────────────────
// Update these if Anthropic changes their pricing.
export const HAIKU_INPUT_USD_PER_TOKEN = 0.80 / 1_000_000;
export const HAIKU_OUTPUT_USD_PER_TOKEN = 4.00 / 1_000_000;

export function calcCostUsd(inputTokens: number, outputTokens: number): number {
  return inputTokens * HAIKU_INPUT_USD_PER_TOKEN + outputTokens * HAIKU_OUTPUT_USD_PER_TOKEN;
}

// ─── Structural validation rules (used as expected_output in dataset items) ───
export const VALIDATION_RULES = {
  // Structure
  response_has_qualified_count: true,
  response_has_excluded_count: true,
  response_has_results_array: true,
  // Per-result fields
  all_results_have_buyer_name: true,
  all_results_have_supplier_name: true,
  all_results_have_award_date: true,
  all_results_have_evidence_excerpt: true,
  all_results_have_framework_hints: true,
  all_results_have_confidence: true,
  all_results_have_link: true,
  // Business logic
  award_dates_within_searched_month: true,
  no_duplicate_links: true,
  currency_always_gbp: true,
  qualified_count_matches_results_length: true,
  confidence_values_are_valid: true,
  // Performance thresholds
  cost_per_result_under_usd: 2.0,
  latency_under_seconds: 300,
  total_cost_under_usd: 5.0,
};

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface EvalInput {
  year: number;
  month: number;
  frameworkId: string | null;
  useContractsFinderCrossCheck: boolean;
}

export interface EvalOutput {
  qualifiedCount: number;
  excludedCount: number;
  results: PSAwardResult[];
}

export interface EvalTraceMeta {
  traceId: string;
  latencySeconds: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface ValidationResult {
  allPassed: boolean;
  failures: string[];
  scores: Record<string, number>;
}

// ─── Validator ─────────────────────────────────────────────────────────────────
export function validateOutput(
  input: EvalInput,
  output: EvalOutput,
  meta: EvalTraceMeta
): ValidationResult {
  const failures: string[] = [];
  const scores: Record<string, number> = {};

  // Structure checks
  if (typeof output.qualifiedCount !== 'number') failures.push('missing_qualified_count');
  if (typeof output.excludedCount !== 'number') failures.push('missing_excluded_count');
  if (!Array.isArray(output.results)) failures.push('results_not_array');

  const results = Array.isArray(output.results) ? output.results : [];

  // Per-result field completeness
  const requiredFields: (keyof PSAwardResult)[] = [
    'buyer_name', 'supplier_name', 'award_date',
    'evidence_excerpt', 'framework_hints', 'confidence', 'link',
  ];

  let fieldScore = 0;
  for (const r of results) {
    const presentCount = requiredFields.filter(f => {
      const v = r[f];
      return v !== undefined && v !== null && v !== '' &&
        !(Array.isArray(v) && v.length === 0);
    }).length;
    fieldScore += presentCount / requiredFields.length;
  }
  scores.field_completeness = results.length > 0 ? fieldScore / results.length : 1;

  // Business logic checks

  // No duplicate links (link is the unique key for PSAwardResult)
  const links = results.map(r => r.link);
  const uniqueLinks = new Set(links);
  if (uniqueLinks.size !== links.length) failures.push('duplicate_links');

  // Valid confidence values
  const validConfidence = ['High', 'Medium', 'Low'];
  if (results.some(r => !validConfidence.includes(r.confidence))) {
    failures.push('invalid_confidence_values');
  }

  // Currency always GBP
  if (results.some(r => r.currency && r.currency !== 'GBP')) {
    failures.push('non_gbp_currency_found');
  }

  // qualified_count matches results array length
  if (output.qualifiedCount !== results.length) failures.push('qualified_count_mismatch');

  // Date accuracy: results with the annotation prefix are intentionally out-of-month — skip them
  const unannotatedOutOfRange = results.filter(r => {
    const desc = r.contract_description ?? '';
    if (desc.startsWith('[Award date:') || desc.startsWith('[No explicit award date')) return false;
    if (!r.award_date) return false;
    const d = new Date(r.award_date);
    return isNaN(d.getTime()) || d.getFullYear() !== input.year || d.getMonth() + 1 !== input.month;
  });
  if (unannotatedOutOfRange.length > 0) failures.push('award_dates_outside_search_month');
  scores.date_accuracy = results.length > 0
    ? (results.length - unannotatedOutOfRange.length) / results.length
    : 1;

  // Cost & performance
  if (meta.costUsd > 5.0) failures.push('cost_exceeded_5usd');
  if (meta.latencySeconds > 300) failures.push('latency_exceeded_300s');
  const costPerResult = output.qualifiedCount > 0 ? meta.costUsd / output.qualifiedCount : 0;
  if (costPerResult > 2.0) failures.push('cost_per_result_exceeded_2usd');
  scores.cost_efficiency = costPerResult > 0 ? Math.max(0, 1 - costPerResult / 2.0) : 1;

  // Overall score: 1.0 if no failures, deduct 0.1 per failure (floor 0)
  scores.overall = Math.max(0, 1 - failures.length * 0.1);

  return { allPassed: failures.length === 0, failures, scores };
}

// ─── Auto-add every real run to the dataset ────────────────────────────────────
export async function addRunToDataset(
  input: EvalInput,
  output: EvalOutput,
  traceMetadata: EvalTraceMeta
): Promise<ValidationResult> {
  const validation = validateOutput(input, output, traceMetadata);
  if (!isLangfuseEnabled()) return validation;
  const langfuse = getLangfuse();

  // Submit numeric scores back to the trace so they appear as evaluations in Langfuse
  for (const [name, value] of Object.entries(validation.scores)) {
    langfuse.score({
      traceId: traceMetadata.traceId,
      name,
      value,
      comment: validation.failures.length > 0
        ? `Failures: ${validation.failures.join(', ')}`
        : 'All checks passed',
    });
  }

  // Record the run as a dataset item for longitudinal tracking
  await langfuse.createDatasetItem({
    datasetName: 'ps-awards-search-eval',
    input,
    expectedOutput: VALIDATION_RULES,
    metadata: {
      // Actual output summary
      actual_qualified_count: output.qualifiedCount,
      actual_excluded_count: output.excludedCount,
      actual_result_count: output.results.length,
      actual_links: output.results.map(r => r.link),
      actual_framework_hints: output.results.flatMap(r => r.framework_hints),
      actual_confidence_scores: output.results.map(r => r.confidence),
      // Cost & performance
      trace_id: traceMetadata.traceId,
      latency_seconds: traceMetadata.latencySeconds,
      prompt_tokens: traceMetadata.promptTokens,
      completion_tokens: traceMetadata.completionTokens,
      total_tokens: traceMetadata.totalTokens,
      cost_usd: traceMetadata.costUsd,
      cost_per_result: output.qualifiedCount > 0
        ? traceMetadata.costUsd / output.qualifiedCount
        : null,
      // Validation summary
      validation_passed: validation.allPassed,
      validation_failures: validation.failures,
      validation_scores: validation.scores,
      run_timestamp: new Date().toISOString(),
    },
  });

  console.log(
    `[Eval] Run recorded — qualified: ${output.qualifiedCount}, ` +
    `cost: $${traceMetadata.costUsd.toFixed(4)}, ` +
    `passed: ${validation.allPassed}` +
    (validation.failures.length > 0 ? ` (${validation.failures.join(', ')})` : '')
  );

  return validation;
}
