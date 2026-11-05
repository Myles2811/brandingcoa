import test from 'node:test';
import assert from 'node:assert/strict';
import { calcCostUsd } from '../src/lib/langfuseEval';
import { createModelClient, isPermanentModelError } from '../src/lib/modelClient';
import type { NormalizedNotice } from '../src/lib/types';

test('scanner cost uses the actual model rather than legacy Haiku rates', () => {
  assert.equal(calcCostUsd(1000, 100, { model: 'gpt-6-luna' }), 0.00015);
  assert.equal(calcCostUsd(1000, 100, { model: 'gpt-6.1-sol' }), 0.003);
  assert.equal(calcCostUsd(1000, 100, { model: 'gpt-6-astra' }), 0.015);
  assert.equal(calcCostUsd(1000, 100, { model: 'claude-sonnet-5' }), 0.0045);
});

test('scanner cost includes separate cache creation and read charges', () => {
  assert.equal(calcCostUsd(1000, 100, {
    model: 'gpt-6.1-sol', cacheCreationInputTokens: 200, cacheReadInputTokens: 300,
  }), 0.00353);
});

test('long-context pricing counts cached input toward the boundary and reprices the whole request', () => {
  const short = calcCostUsd(270_000, 100, {
    model: 'gpt-6.1-sol', cacheCreationInputTokens: 1000, cacheReadInputTokens: 1000,
  });
  assert.equal(short, 0.5436);
  const long = calcCostUsd(270_001, 100, {
    model: 'gpt-6.1-sol', cacheCreationInputTokens: 1000, cacheReadInputTokens: 1000,
  });
  assert.equal(long, 1.086704);
});

test('unknown provider fails before constructing a model client or sending a request', t => {
  const previous = process.env.AI_PROVIDER;
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previous;
  });
  process.env.AI_PROVIDER = 'azure_typo';
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected request'); };
  assert.throws(() => createModelClient({ apiKey: 'synthetic-key' }), error => {
    assert.match(String(error), /Unsupported AI_PROVIDER/);
    assert.equal(isPermanentModelError(error), true);
    return true;
  });
  assert.equal(requests, 0);
});

test('scanner uses Azure deployment and stops all batches after permanent authentication failure', async t => {
  const originalFetch = globalThis.fetch;
  const previous = Object.fromEntries(['AI_PROVIDER', 'AZURE_OPENAI_BASE_URL', 'AZURE_OPENAI_API_KEY', 'PS_AWARDS_MODEL']
    .map(key => [key, process.env[key]]));
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.AI_PROVIDER = 'azure_openai';
  process.env.AZURE_OPENAI_BASE_URL = 'https://azure-scanner.example.invalid/openai/v1/';
  process.env.AZURE_OPENAI_API_KEY = 'synthetic-azure-key';
  process.env.PS_AWARDS_MODEL = 'claude-sonnet-5';
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    requests++;
    assert.equal(String(input), 'https://azure-scanner.example.invalid/openai/v1/responses');
    assert.equal(JSON.parse(String(init?.body)).model, 'gpt-6.1-sol');
    return new Response(JSON.stringify({ error: { message: 'Synthetic authentication failure' } }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  };
  const { classifyNotices, PS_AWARDS_MODEL } = await import('../src/lib/psAwardClassifier');
  assert.equal(PS_AWARDS_MODEL, 'gpt-6.1-sol');
  const notices: NormalizedNotice[] = Array.from({ length: 31 }, (_, index) => ({
    source: 'find_tender', candidate_id: `synthetic:${index}`, notice_id: `synthetic:${index}`,
    release_id: 'release', award_id: 'award', lot_ids: [], contract_ids: [], ocid: 'ocid',
    buyer_name: 'Example Council', supplier_name: 'Example Supplier', contract_description: 'Services',
    award_date: '2026-03-10', publication_date: '2026-03-20', award_value: 100, currency: 'GBP',
    notice_url: 'https://example.invalid/notice', evidence_text: 'Procurement Services Y23065 call-off',
    framework_hints: ['Y23065'],
  }));
  const outcome = await classifyNotices(notices, 2026, 3, '', 'synthetic-azure-key');
  assert.equal(requests, 1);
  assert.equal(outcome.complete, false);
  assert.equal(outcome.issues.length, 1);
  assert.equal(outcome.issues[0].recoverable, false);
});

test('scanner includes charged incomplete responses in token usage when a retry succeeds', async t => {
  const originalFetch = globalThis.fetch;
  const previous = Object.fromEntries(['AI_PROVIDER', 'AZURE_OPENAI_BASE_URL', 'AZURE_OPENAI_API_KEY']
    .map(key => [key, process.env[key]]));
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.AI_PROVIDER = 'azure_openai';
  process.env.AZURE_OPENAI_BASE_URL = 'https://azure-scanner.example.invalid/openai/v1/';
  process.env.AZURE_OPENAI_API_KEY = 'synthetic-azure-key';
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response(JSON.stringify({
      id: `response-${requests}`, model: 'gpt-6.1-sol', status: requests === 1 ? 'incomplete' : 'completed',
      incomplete_details: requests === 1 ? { reason: 'max_output_tokens' } : null,
      output: requests === 1 ? [] : [{ type: 'function_call', name: 'record_qualifying_awards',
        call_id: 'call-synthetic', arguments: JSON.stringify({ matches: [] }) }],
      usage: { input_tokens: 150, output_tokens: 20, input_tokens_details: { cached_tokens: 0 } },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const { classifyNotices } = await import('../src/lib/psAwardClassifier');
  const notice: NormalizedNotice = {
    source: 'find_tender', candidate_id: 'synthetic', notice_id: 'synthetic',
    release_id: 'release', award_id: 'award', lot_ids: [], contract_ids: [], ocid: 'ocid',
    buyer_name: 'Example Council', supplier_name: 'Example Supplier', contract_description: 'Services',
    award_date: '2026-03-10', publication_date: '2026-03-20', award_value: 100, currency: 'GBP',
    notice_url: 'https://example.invalid/notice', evidence_text: 'An unrelated services award.', framework_hints: [],
  };
  const outcome = await classifyNotices([notice], 2026, 3, '', 'synthetic-azure-key');
  assert.equal(requests, 2);
  assert.equal(outcome.complete, true);
  assert.equal(outcome.usage.input, 300);
  assert.equal(outcome.usage.output, 40);
  assert.equal(outcome.usage.total, 340);
});
