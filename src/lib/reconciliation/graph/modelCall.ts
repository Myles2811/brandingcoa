import type Anthropic from '@anthropic-ai/sdk';
import { recordRunAudit } from './audit';
import { createModelClient, isPermanentModelError, modelApiKey, resolveModel } from '../../modelClient';

export const RECONCILIATION_MODELS = {
  frameworkRateLookup: resolveModel('claude-haiku-4-5'),
  buyerEvidence: resolveModel('claude-sonnet-5'),
  supplierEvidence: resolveModel('claude-haiku-4-5'),
  evidenceJudge: resolveModel('claude-opus-4-8'),
  confidenceAndFinding: resolveModel('claude-haiku-4-5'),
  structuredOutput: resolveModel('claude-haiku-4-5'),
} as const;

export function reconciliationApiKey(): string {
  return modelApiKey();
}

export type ToolSchema = Anthropic.Messages.Tool;

export async function callForcedTool<T>(options: {
  apiKey: string;
  model: string;
  system: string;
  tool: ToolSchema;
  input: unknown;
  validate: (value: unknown) => T;
  feedback?: string | null;
  audit: { runId: string; awardId: string; node: string };
}): Promise<T> {
  const client = createModelClient({ apiKey: options.apiKey });
  const requestInput = {
    input: options.input,
    retry_feedback: options.feedback ?? null,
    instruction: `Call ${options.tool.name} exactly once.`,
  };
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: Anthropic.Messages.Message | null = null;
    try {
      response = await client.messages.create({
        model: options.model,
        max_tokens: 2048,
        system: [{ type: 'text', text: options.system, cache_control: { type: 'ephemeral' } }],
        tools: [options.tool],
        tool_choice: { type: 'tool', name: options.tool.name },
        messages: [{
          role: 'user',
          content: JSON.stringify(requestInput),
        }],
      });
      if (response.stop_reason === 'max_tokens') throw new Error('model output was truncated');
      const block = response.content.find(item => item.type === 'tool_use' && item.name === options.tool.name);
      if (!block || block.type !== 'tool_use') throw new Error(`missing forced ${options.tool.name} tool call`);
      const output = options.validate(block.input);
      recordRunAudit({
        run_id: options.audit.runId, award_id: options.audit.awardId, node: options.audit.node,
        model: response.model, tool: options.tool.name, attempt, system_prompt: options.system,
        input: requestInput, output: block.input,
        usage: {
          input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens,
          cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
        }, error: null,
      });
      return output;
    } catch (error) {
      lastError = error;
      // Validation can fail after the provider has billed the response. Keep that
      // usage in the audit so retries cannot make the run's cost look smaller.
      const billedUsage = response?.usage ?? (
        error && typeof error === 'object' && 'usage' in error
          ? (error as { usage?: Anthropic.Messages.Usage }).usage
          : undefined
      );
      recordRunAudit({
        run_id: options.audit.runId, award_id: options.audit.awardId, node: options.audit.node,
        model: response?.model ?? options.model, tool: options.tool.name, attempt, system_prompt: options.system,
        input: requestInput, output: null, usage: billedUsage ? {
          input_tokens: billedUsage.input_tokens,
          output_tokens: billedUsage.output_tokens,
          cache_creation_input_tokens: billedUsage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: billedUsage.cache_read_input_tokens ?? 0,
        } : null,
        error: error instanceof Error ? error.message : String(error),
      });
      if (isPermanentModelError(error)) break;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 750 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${options.tool.name} failed validation`);
}

export function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

export function requiredString(record: Record<string, unknown>, field: string): string {
  if (typeof record[field] !== 'string') throw new Error(`${field} must be a string`);
  return record[field];
}

export function nullableString(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${field} must be a string or null`);
  return value;
}

export function nullableNumber(record: Record<string, unknown>, field: string): number | null {
  const value = record[field];
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${field} must be a finite number or null`);
  return value;
}

export function requiredBoolean(record: Record<string, unknown>, field: string): boolean {
  if (typeof record[field] !== 'boolean') throw new Error(`${field} must be a boolean`);
  return record[field];
}

export function enumValue<T extends string>(record: Record<string, unknown>, field: string, values: readonly T[]): T {
  const value = record[field];
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`${field} has an invalid value`);
  return value as T;
}
