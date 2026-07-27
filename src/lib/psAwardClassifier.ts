import Anthropic from '@anthropic-ai/sdk';
import { NormalizedNotice, PSAwardResult, RejectedCandidate, RunIssue, RunUsage } from './types';
import { PS_FRAMEWORK_IDS } from './noticeNormalizer';
import { findSupplierFrameworkSupport, frameworkStatusAt, getFramework } from './frameworkCatalogue';

export const PS_AWARDS_MODEL = process.env.PS_AWARDS_MODEL || 'claude-sonnet-5';
const BATCH_SIZE = 30;
const MAX_ATTEMPTS = 3;

const SYSTEM = `You classify UK public procurement award records for Procurement Services framework call-offs.

Return a record only when the supplied evidence supports a real contract award or call-off connected to Procurement Services. Strong signals include any Procurement Services Y-number from Y20 through Y29, TPPLCSKL03, PS-prefixed framework references, or explicit wording such as Procurement Services framework, KCS Procurement Services, Commercial Services Group Procurement Services, or call-off under a PS framework. Framework names and unambiguous contextual wording may support a Medium-confidence match even when a reference is absent.

Supplier framework memberships are supporting evidence only. A listed supplier can hold unrelated contracts, so membership must never be the sole reason for returning a record. Require a separate Procurement Services signal in the notice evidence. Respect framework_context: an expired framework may support a historical award made on or before its expiry, but an award made after expiry must not be accepted solely under that identifier. A coming-soon framework is not current until activated.

Reject opportunities, PINs, ITTs, pipelines, unawarded lots, framework maximum values, and references to unrelated CCS RM, NHS SBS, ESPO, YPO or NEPO frameworks unless separate Procurement Services evidence exists. Do not return Kent County Council or other Kent-branded authorities acting as buyer. Buyer, supplier, award date, publication date and value are authoritative source fields; do not rewrite them.

The requested month is publication scope. An older award date is allowed when publication_date is in the requested month. Never infer missing evidence. Use the provided tool exactly once and include only qualifying candidate IDs.

Known identifiers: ${PS_FRAMEWORK_IDS.join(', ')}. Generic Y-number patterns and new valid Procurement Services identifiers not yet in this list must still be considered.`;

const DECISION_TOOL: Anthropic.Messages.Tool = {
  name: 'record_qualifying_awards',
  description: 'Record only candidates that qualify as Procurement Services framework awards.',
  input_schema: {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            candidate_id: { type: 'string' },
            confidence: { type: 'string', enum: ['High', 'Medium'] },
            evidence_excerpt: { type: 'string' },
          },
          required: ['candidate_id', 'confidence', 'evidence_excerpt'],
          additionalProperties: false,
        },
      },
    },
    required: ['matches'],
    additionalProperties: false,
  },
};

interface Decision {
  candidate_id: string;
  confidence: 'High' | 'Medium';
  evidence_excerpt: string;
}

export type ClassifyUsage = RunUsage;

export interface ClassificationOutcome {
  results: PSAwardResult[];
  rejected: RejectedCandidate[];
  usage: ClassifyUsage;
  issues: RunIssue[];
  complete: boolean;
}

function emptyUsage(): ClassifyUsage {
  return { input: 0, output: 0, cache_creation_input: 0, cache_read_input: 0, total: 0 };
}

function addUsage(total: ClassifyUsage, usage: Anthropic.Messages.Usage): void {
  total.input += usage.input_tokens;
  total.output += usage.output_tokens;
  total.cache_creation_input += usage.cache_creation_input_tokens ?? 0;
  total.cache_read_input += usage.cache_read_input_tokens ?? 0;
  total.total = total.input + total.output + total.cache_creation_input + total.cache_read_input;
}

function isInMonth(dateStr: string, year: number, month: number): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return !Number.isNaN(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
}

function candidatePayload(notice: NormalizedNotice) {
  const evidenceDate = notice.award_date || notice.publication_date || new Date().toISOString();
  const frameworkContext = notice.framework_hints.flatMap(id => {
    const framework = getFramework(id);
    return framework ? [{
      id: framework.id,
      name: framework.name,
      status_at_award: frameworkStatusAt(framework, evidenceDate),
      expiry_date: framework.expiry_date,
    }] : [];
  });
  return {
    candidate_id: notice.candidate_id,
    buyer_name: notice.buyer_name,
    supplier_name: notice.supplier_name,
    contract_description: notice.contract_description,
    award_date: notice.award_date,
    publication_date: notice.publication_date,
    award_value: notice.award_value,
    currency: notice.currency,
    evidence_text: notice.evidence_text,
    framework_hints: notice.framework_hints,
    framework_context: frameworkContext,
    supplier_framework_memberships_supporting_only: findSupplierFrameworkSupport(notice.supplier_name, evidenceDate),
  };
}

function onlyInvalidLifecycleHints(notice: NormalizedNotice): boolean {
  const knownHints = notice.framework_hints.map(getFramework).filter(framework => framework !== undefined);
  if (knownHints.length === 0) return false;
  const unknownHintExists = notice.framework_hints.some(id => !getFramework(id));
  if (unknownHintExists) return false;
  const evidenceDate = notice.award_date || notice.publication_date;
  if (!evidenceDate) return false;
  return knownHints.every(framework => {
    const status = frameworkStatusAt(framework, evidenceDate);
    return status === 'expired' || status === 'coming_soon';
  });
}

function hasValidRegisteredFrameworkHint(notice: NormalizedNotice): boolean {
  const evidenceDate = notice.award_date || notice.publication_date;
  if (!evidenceDate) return false;
  return notice.framework_hints.some(id => {
    const framework = getFramework(id);
    if (!framework) return false;
    const status = frameworkStatusAt(framework, evidenceDate);
    return status === 'active' || status === 'expiring';
  });
}

function parseDecisions(response: Anthropic.Messages.Message, validIds: Set<string>): Decision[] {
  if (response.stop_reason === 'max_tokens') throw new Error('model output truncated at max_tokens');
  const toolUse = response.content.find(block => block.type === 'tool_use' && block.name === DECISION_TOOL.name);
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('model did not return the required structured tool output');
  const input = toolUse.input as { matches?: unknown[] };
  if (!Array.isArray(input.matches)) throw new Error('structured output is missing matches array');
  const decisions: Decision[] = [];
  for (const value of input.matches) {
    if (!value || typeof value !== 'object') throw new Error('invalid match object');
    const match = value as Record<string, unknown>;
    if (typeof match.candidate_id !== 'string' || !validIds.has(match.candidate_id)) throw new Error('unknown candidate_id in model output');
    if (match.confidence !== 'High' && match.confidence !== 'Medium') throw new Error('invalid confidence in model output');
    if (typeof match.evidence_excerpt !== 'string' || !match.evidence_excerpt.trim()) throw new Error('missing evidence excerpt');
    decisions.push(match as unknown as Decision);
  }
  return decisions;
}

function isCreditError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /credit balance is too low|billing|purchase credits/i.test(message);
}

async function classifyBatch(
  client: Anthropic,
  batch: NormalizedNotice[],
  year: number,
  month: number,
  exclusionListText: string,
  usage: ClassifyUsage,
  targeted = false,
): Promise<Decision[]> {
  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  const prompt = `${targeted ? 'RECALL REVIEW: Re-check these candidates because deterministic text signals were detected. ' : ''}Publication month: ${monthName} ${year}.\nCandidates:${JSON.stringify(batch.map(candidatePayload))}${exclusionListText.trim() ? `\nManual exclusions:${exclusionListText.trim()}` : ''}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.messages.create({
        model: PS_AWARDS_MODEL,
        max_tokens: 4096,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: [DECISION_TOOL],
        tool_choice: { type: 'tool', name: DECISION_TOOL.name },
        messages: [{ role: 'user', content: prompt }],
      });
      addUsage(usage, response.usage);
      return parseDecisions(response, new Set(batch.map(notice => notice.candidate_id)));
    } catch (error) {
      lastError = error;
      if (isCreditError(error)) throw error;
      if (attempt < MAX_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('classification failed');
}

function plausibleRecallSignal(notice: NormalizedNotice): boolean {
  return /\bY2\d{4}\b|\bPS\d{4,}\b|TPPLCSKL03|procurement services|KCS|commercial services group|call[- ]off[^|]{0,80}framework/i
    .test(`${notice.evidence_text} ${notice.framework_hints.join(' ')}`);
}

function resultFromDecision(notice: NormalizedNotice, decision: Decision, now: string): PSAwardResult {
  const registerConfirmed = hasValidRegisteredFrameworkHint(notice);
  const confidence: PSAwardResult['confidence'] = registerConfirmed ? decision.confidence : 'Low';
  return {
    candidate_id: notice.candidate_id,
    ocid: notice.ocid,
    release_id: notice.release_id,
    award_id: notice.award_id,
    lot_ids: notice.lot_ids,
    contract_ids: notice.contract_ids,
    buyer_name: notice.buyer_name,
    supplier_name: notice.supplier_name,
    contract_description: notice.contract_description,
    award_date: notice.award_date,
    publication_date: notice.publication_date,
    award_value: notice.award_value,
    currency: notice.currency,
    evidence_excerpt: registerConfirmed
      ? decision.evidence_excerpt
      : `${decision.evidence_excerpt} Framework register status: not confirmed from the extracted framework hints, so this is retained as low confidence pending manual review.`,
    confidence,
    link: notice.notice_url,
    framework_hints: notice.framework_hints,
    first_seen_timestamp: now,
    source: notice.source,
  };
}

export async function classifyNotices(
  notices: NormalizedNotice[], year: number, month: number, exclusionListText: string,
  apiKey: string,
): Promise<ClassificationOutcome> {
  const usage = emptyUsage();
  if (notices.length === 0) return { results: [], rejected: [], usage, issues: [], complete: true };
  const client = new Anthropic({ apiKey });
  const decisions = new Map<string, Decision>();
  const issues: RunIssue[] = [];

  for (let index = 0; index < notices.length; index += BATCH_SIZE) {
    const batch = notices.slice(index, index + BATCH_SIZE);
    try {
      for (const decision of await classifyBatch(client, batch, year, month, exclusionListText, usage)) {
        decisions.set(decision.candidate_id, decision);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push({ stage: 'model_classification', message: `batch ${index / BATCH_SIZE + 1}: ${message}`, recoverable: !isCreditError(error) });
      if (isCreditError(error)) break;
    }
  }

  // A targeted second pass protects recall for explicit/broad PS signals omitted by the first pass.
  if (issues.length === 0) {
    const recallCandidates = notices.filter(notice => !decisions.has(notice.candidate_id) && plausibleRecallSignal(notice));
    for (let index = 0; index < recallCandidates.length; index += BATCH_SIZE) {
      const batch = recallCandidates.slice(index, index + BATCH_SIZE);
      try {
        for (const decision of await classifyBatch(client, batch, year, month, exclusionListText, usage, true)) {
          decisions.set(decision.candidate_id, decision);
        }
      } catch (error) {
        issues.push({ stage: 'model_recall_review', message: error instanceof Error ? error.message : String(error), recoverable: !isCreditError(error) });
        if (isCreditError(error)) break;
      }
    }
  }

  const now = new Date().toISOString();
  const results: PSAwardResult[] = [];
  const rejected: RejectedCandidate[] = [];
  for (const notice of notices) {
    const decision = decisions.get(notice.candidate_id);
    if (!decision) {
      rejected.push({ notice_id: notice.notice_id, buyer_name: notice.buyer_name, supplier_name: notice.supplier_name, rejection_reason: 'Not classified as PS framework award', raw_evidence: notice.evidence_text.slice(0, 300) });
      continue;
    }
    if (onlyInvalidLifecycleHints(notice)) {
      rejected.push({ notice_id: notice.notice_id, buyer_name: notice.buyer_name, supplier_name: notice.supplier_name, rejection_reason: 'Framework was expired or not yet active on the award date', raw_evidence: notice.evidence_text.slice(0, 300) });
      continue;
    }
    if (!isInMonth(notice.award_date, year, month) && !isInMonth(notice.publication_date, year, month)) {
      rejected.push({ notice_id: notice.notice_id, buyer_name: notice.buyer_name, supplier_name: notice.supplier_name, rejection_reason: 'Award and publication dates are outside scope', raw_evidence: notice.evidence_text.slice(0, 300) });
      continue;
    }
    results.push(resultFromDecision(notice, decision, now));
  }

  return { results, rejected, usage, issues, complete: issues.length === 0 };
}
