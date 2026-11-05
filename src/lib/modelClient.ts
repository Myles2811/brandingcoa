/** Provider boundary for the original branding workflows. Azure uses the Responses API;
 * callers retain their existing forced-tool validation and authoritative-field checks. */
import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

export type ModelUsage = {
  input_tokens: number; output_tokens: number;
  cache_creation_input_tokens?: number; cache_read_input_tokens?: number;
};

export interface ModelCallRecord {
  timestamp: string; model: string; response_model: string | null;
  response_id: string | null; request_id: string | null; http_status: number;
  usage: ModelUsage | null; reasoning_tokens: number; estimated_cost_usd: number;
  elapsed_ms: number; error: string | null;
  usage_unknown?: boolean; cost_is_upper_bound?: boolean;
}

const records: ModelCallRecord[] = [];
let reservedUsd = 0;
let spentUsd = 0;

export function usingAzure(): boolean {
  const provider = process.env.AI_PROVIDER?.trim();
  if (provider && provider !== 'azure_openai' && provider !== 'anthropic') {
    throw new ModelConfigurationError(`Unsupported AI_PROVIDER: ${provider}`);
  }
  return provider === 'azure_openai';
}

export function resolveModel(model: string): string {
  if (!usingAzure()) return model;
  if (/^claude-haiku-4-5/.test(model)) return process.env.AZURE_OPENAI_FAST_MODEL || 'gpt-6-luna';
  if (/^claude-sonnet-5/.test(model)) return process.env.AZURE_OPENAI_MAIN_MODEL || 'gpt-6.1-sol';
  if (/^claude-opus-4-8/.test(model)) return process.env.AZURE_OPENAI_JUDGE_MODEL || 'gpt-6-astra';
  return model;
}

export function modelApiKey(): string {
  const name = usingAzure() ? 'AZURE_OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  const key = process.env[name]?.trim();
  if (!key) throw new ModelConfigurationError(`${name} is not configured`);
  return key;
}

// USD per million fresh input, output, cache-write, cache-read tokens. These are
// planning rates, not an Azure invoice; the trial records observed token usage.
const PRICES: Record<string, readonly number[]> = {
  'gpt-6-luna': [0.10, 0.50, 0.125, 0.01],
  'gpt-6.1-sol': [2, 10, 2.5, 0.10],
  'gpt-6-sol': [2, 10, 2.5, 0.20],
  'gpt-6-astra': [10, 50, 12.5, 1],
  'gpt-5.6-terra': [2, 12, 2.5, 0.20],
  'claude-haiku-4-5': [1, 5, 1.25, 0.10],
  'claude-sonnet-5': [3, 15, 3.75, 0.30],
  'claude-opus-4-8': [5, 25, 6.25, 0.50],
};

export function modelCostUsd(model: string, usage: ModelUsage): number {
  const price = PRICES[model];
  if (!price) throw new ModelConfigurationError(`No planning rate configured for ${model}`);
  const cacheWrites = usage.cache_creation_input_tokens ?? 0;
  const cacheReads = usage.cache_read_input_tokens ?? 0;
  const totalInput = usage.input_tokens + cacheWrites + cacheReads;
  // The GPT planning rates above are short-context rates. All input categories
  // count toward the 272K boundary; the surcharge applies to the whole request.
  const longContext = model.startsWith('gpt-') && totalInput > 272_000;
  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplier = longContext ? 1.5 : 1;
  return ((usage.input_tokens * price[0] + cacheWrites * price[2] + cacheReads * price[3]) * inputMultiplier
    + usage.output_tokens * price[1] * outputMultiplier) / 1_000_000;
}

class ModelConfigurationError extends Error { readonly permanent = true; }
export class ModelBudgetError extends Error { readonly permanent = true; }
export class AzureModelError extends Error {
  constructor(message: string, public status?: number, public usage?: ModelUsage) { super(message); }
}

export function isPermanentModelError(error: unknown): boolean {
  const value = error as { permanent?: boolean; status?: number; message?: string } | null;
  return !!value?.permanent || [400, 401, 403, 404].includes(value?.status ?? 0)
    || /credit balance|purchase credits|billing/i.test(value?.message ?? '');
}

/** Strict Responses tools cannot contain untyped objects: reject these rather than
 * silently stripping evidence fields by turning their schema into an empty object. */
export function strictToolSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictToolSchema);
  if (!value || typeof value !== 'object') return value;
  const schema = value as Record<string, unknown>;
  const type = schema.type;
  const object = type === 'object' || (Array.isArray(type) && type.includes('object'));
  if (object && !schema.properties) throw new ModelConfigurationError('Azure strict tool object requires explicit properties');
  const output = Object.fromEntries(Object.entries(schema).map(([key, entry]) => [key, strictToolSchema(entry)]));
  if (object) {
    output.additionalProperties = false;
    const keys = Object.keys(schema.properties as object);
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (keys.some(key => !required.includes(key))) {
      throw new ModelConfigurationError('Azure strict tools require every property to be required (use null for optional values)');
    }
    output.required = keys;
  }
  return output;
}

export function getModelCallRecords(): ModelCallRecord[] { return records.map(record => ({ ...record })); }
export function resetModelCallRecords(): void { records.length = 0; spentUsd = 0; reservedUsd = 0; }

/** Restore this trial's content-free usage ledger before resuming, so its configured
 * spending cap covers earlier paid attempts as well as the current process. */
export function restoreModelCallRecords(path: string): void {
  resetModelCallRecords();
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n').filter(Boolean)) {
    const record = JSON.parse(line) as ModelCallRecord;
    if (!Number.isFinite(record.estimated_cost_usd) || record.estimated_cost_usd < 0) {
      throw new ModelConfigurationError('Invalid cost in the trial usage ledger');
    }
    records.push(record);
    spentUsd += record.estimated_cost_usd;
  }
}

function redact(message: string): string {
  for (const name of ['AZURE_OPENAI_API_KEY', 'ANTHROPIC_API_KEY']) {
    const secret = process.env[name];
    if (secret) message = message.replaceAll(secret, '[REDACTED]');
  }
  return message;
}

type Request = Anthropic.Messages.MessageCreateParamsNonStreaming;
type Client = { messages: { create(request: Request): Promise<Anthropic.Messages.Message> } };

export function createModelClient(options: { apiKey?: string } = {}): Client {
  if (!usingAzure()) return new Anthropic({ apiKey: options.apiKey || modelApiKey() });
  return { messages: { create: request => createAzureMessage(request) } };
}

async function createAzureMessage(request: Request): Promise<Anthropic.Messages.Message> {
  const key = modelApiKey();
  const base = process.env.AZURE_OPENAI_BASE_URL?.trim();
  if (!base) throw new ModelConfigurationError('AZURE_OPENAI_BASE_URL is not configured');
  const url = new URL(base);
  if (url.protocol !== 'https:') throw new ModelConfigurationError('Azure endpoint must use HTTPS');
  const model = resolveModel(request.model);
  const tools = request.tools?.map(tool => {
    if (!('input_schema' in tool)) throw new ModelConfigurationError('Only function tools are supported by this workflow');
    return { type: 'function', name: tool.name, description: tool.description,
      parameters: strictToolSchema(tool.input_schema), strict: true };
  });
  const toolChoice = request.tool_choice;
  if (!toolChoice || toolChoice.type !== 'tool') throw new ModelConfigurationError('Workflow requests must force a named tool');
  const instructions = typeof request.system === 'string' ? request.system
    : request.system?.map(block => block.text).join('\n') ?? '';
  const input = request.messages.map(message => {
    if (typeof message.content !== 'string') throw new ModelConfigurationError('Workflow messages must use text content');
    return { role: message.role, content: message.content };
  });
  const body = {
    model, instructions, input, tools, tool_choice: { type: 'function', name: toolChoice.name },
    parallel_tool_calls: false, max_output_tokens: request.max_tokens,
    reasoning: { effort: model === (process.env.AZURE_OPENAI_JUDGE_MODEL || 'gpt-6-astra')
      ? process.env.AZURE_OPENAI_JUDGE_REASONING_EFFORT || 'medium'
      : process.env.AZURE_OPENAI_REASONING_EFFORT || 'low' },
    store: false,
  };
  const cap = Number(process.env.AI_MAX_COST_USD ?? '15');
  if (!Number.isFinite(cap) || cap <= 0) throw new ModelConfigurationError('AI_MAX_COST_USD must be positive');
  // A conservative reservation includes schema/framing bytes and all possible output.
  // Reserve input at the highest category rate (cache writes), including a
  // possible long-context surcharge, until Azure supplies actual token usage.
  const reservation = modelCostUsd(model, {
    input_tokens: 0,
    cache_creation_input_tokens: Buffer.byteLength(JSON.stringify(body), 'utf8') + 8192,
    output_tokens: request.max_tokens,
  });
  if (spentUsd + reservedUsd + reservation > cap) throw new ModelBudgetError(`Model budget would exceed configured $${cap.toFixed(2)} cap`);
  reservedUsd += reservation;
  const started = Date.now();
  const record: ModelCallRecord = { timestamp: new Date().toISOString(), model, response_model: null,
    response_id: null, request_id: null, http_status: 0, usage: null,
    reasoning_tokens: 0, estimated_cost_usd: 0, elapsed_ms: 0, error: null };
  try {
    const response = await fetch(`${base.replace(/\/+$/, '')}/responses`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 120_000)),
    });
    record.http_status = response.status;
    record.request_id = response.headers.get('x-request-id') || response.headers.get('apim-request-id');
    const data = await response.json();
    if (!response.ok) throw new AzureModelError(`Azure model request failed (${response.status}): ${redact(data.error?.message ?? response.statusText)}`, response.status);
    record.response_model = data.model ?? null;
    record.response_id = data.id ?? null;
    if (!data.usage || !Number.isFinite(data.usage.input_tokens) || !Number.isFinite(data.usage.output_tokens)) {
      throw new AzureModelError('Azure response did not include billable token usage');
    }
    const details = data.usage.input_tokens_details ?? {};
    const cached = details.cached_tokens ?? 0;
    const written = details.cache_write_tokens ?? details.cache_creation_tokens ?? 0;
    const reasoning = data.usage.output_tokens_details?.reasoning_tokens ?? 0;
    const counts = [data.usage.input_tokens, data.usage.output_tokens, cached, written, reasoning];
    if (counts.some(value => !Number.isSafeInteger(value) || value < 0)
      || cached + written > data.usage.input_tokens || reasoning > data.usage.output_tokens) {
      throw new AzureModelError('Azure response contained invalid billable token counts');
    }
    const usage: ModelUsage = {
      input_tokens: Math.max(0, data.usage.input_tokens - cached - written),
      output_tokens: data.usage.output_tokens,
      cache_creation_input_tokens: written, cache_read_input_tokens: cached,
    };
    record.usage = usage;
    record.reasoning_tokens = reasoning;
    record.estimated_cost_usd = modelCostUsd(model, usage);
    if (data.status !== 'completed') throw new AzureModelError(`Azure response was ${data.status}: ${data.incomplete_details?.reason ?? 'not completed'}`, undefined, usage);
    const calls = (data.output ?? []).filter((item: { type?: string }) => item.type === 'function_call');
    if (calls.length !== 1 || calls[0].name !== toolChoice.name) {
      throw new AzureModelError(`Azure response did not return exactly one ${toolChoice.name} function call`, undefined, usage);
    }
    let args: unknown;
    try { args = JSON.parse(calls[0].arguments); }
    catch { throw new AzureModelError('Azure function arguments were not valid JSON', undefined, usage); }
    return {
      id: data.id, type: 'message', role: 'assistant', model: data.model ?? model,
      content: [{ type: 'tool_use', id: calls[0].call_id ?? calls[0].id, name: calls[0].name, input: args }],
      stop_reason: 'tool_use', stop_sequence: null,
      usage: { ...usage, cache_creation_input_tokens: written, cache_read_input_tokens: cached },
    } as Anthropic.Messages.Message;
  } catch (error) {
    record.error = redact(error instanceof Error ? error.message : String(error));
    if (!record.usage && (record.http_status === 0 || (record.http_status >= 200 && record.http_status < 300))) {
      // A timeout or unreadable successful response can still be billed. Stop rather
      // than retrying for free, and retain the reservation as an explicit upper bound.
      record.usage_unknown = true;
      record.cost_is_upper_bound = true;
      record.estimated_cost_usd = reservation;
      throw new ModelConfigurationError(`Azure request billing outcome is unknown; trial stopped without retry: ${record.error}`);
    }
    if (record.usage && error && typeof error === 'object') Object.assign(error, { usage: record.usage });
    throw error;
  } finally {
    reservedUsd -= reservation;
    spentUsd += record.estimated_cost_usd;
    record.elapsed_ms = Date.now() - started;
    records.push(record);
    const ledger = process.env.AI_USAGE_LEDGER;
    if (ledger) {
      try { appendFileSync(ledger, `${JSON.stringify(record)}\n`, { mode: 0o600 }); }
      catch {
        const error = new ModelConfigurationError('Unable to persist the model usage ledger; trial stopped without retry');
        if (record.usage) Object.assign(error, { usage: record.usage });
        throw error;
      }
    }
    if (process.env.AI_LOG_USAGE === '1') console.log(`[AI] ${model} ${record.error ? 'failed' : 'complete'}; calls=${records.length}; estimated_total_usd=${spentUsd.toFixed(4)}`);
  }
}
