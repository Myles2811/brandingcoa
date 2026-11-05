import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelClient, getModelCallRecords, isPermanentModelError, resetModelCallRecords, strictToolSchema } from '../src/lib/modelClient';

const request = {
  model: 'gpt-6-sol', max_tokens: 100,
  system: 'Synthetic verification',
  tools: [{ name: 'record', input_schema: { type: 'object' as const, properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } }],
  tool_choice: { type: 'tool' as const, name: 'record' },
  messages: [{ role: 'user' as const, content: 'Synthetic input' }],
};

function configure() {
  process.env.AI_PROVIDER = 'azure_openai';
  process.env.AZURE_OPENAI_BASE_URL = 'https://synthetic.example.invalid/openai/v1/';
  process.env.AZURE_OPENAI_API_KEY = 'synthetic-test-key';
  process.env.AI_MAX_COST_USD = '1';
  delete process.env.AI_USAGE_LEDGER;
  resetModelCallRecords();
}

test('Azure adapter forces strict Responses tools and normalizes cache usage without double charging', async () => {
  configure();
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://synthetic.example.invalid/openai/v1/responses');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.tool_choice, { type: 'function', name: 'record' });
    assert.equal(body.tools[0].strict, true);
    assert.equal(body.parallel_tool_calls, false);
    assert.equal(body.store, false);
    return new Response(JSON.stringify({ id: 'response-synthetic', model: 'gpt-6-sol', status: 'completed',
      usage: { input_tokens: 120, output_tokens: 10, input_tokens_details: { cached_tokens: 20 }, output_tokens_details: { reasoning_tokens: 2 } },
      output: [{ type: 'function_call', name: 'record', call_id: 'call-synthetic', arguments: '{"ok":true}' }],
    }), { status: 200, headers: { 'x-request-id': 'request-synthetic' } });
  };
  try {
    const message = await createModelClient().messages.create(request);
    assert.equal(message.usage.input_tokens, 100);
    assert.equal(message.usage.cache_read_input_tokens, 20);
    const records = getModelCallRecords();
    assert.equal(records[0].reasoning_tokens, 2);
    assert.equal(records[0].request_id, 'request-synthetic');
    assert.ok(Math.abs(records[0].estimated_cost_usd - 0.000304) < 1e-12);
  } finally { globalThis.fetch = original; }
});

test('paid malformed tool output retains usage in both error and trial ledger', async () => {
  configure();
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'bad', model: 'gpt-6-sol', status: 'completed',
    usage: { input_tokens: 100, output_tokens: 10 },
    output: [{ type: 'function_call', name: 'record', arguments: 'invalid json' }],
  }), { status: 200 });
  try {
    await assert.rejects(createModelClient().messages.create(request), error => {
      assert.equal((error as { usage: { input_tokens: number } }).usage.input_tokens, 100);
      return true;
    });
    assert.equal(getModelCallRecords()[0].estimated_cost_usd, 0.0003);
    assert.match(getModelCallRecords()[0].error!, /valid JSON/);
  } finally { globalThis.fetch = original; }
});

test('budget reservations stop requests before a paid call is sent', async () => {
  configure();
  process.env.AI_MAX_COST_USD = '0.000001';
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('unexpected call'); };
  try {
    await assert.rejects(createModelClient().messages.create(request), error => isPermanentModelError(error));
    assert.equal(called, false);
    assert.equal(getModelCallRecords().length, 0);
  } finally { globalThis.fetch = original; }
});

test('untyped evidence objects cannot be silently collapsed by strict schema conversion', () => {
  assert.throws(() => strictToolSchema({ type: ['object', 'null'] }), /explicit properties/);
});

test('unknown transport billing fails closed and retains the conservative reservation', async () => {
  configure();
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('synthetic connection interrupted'); };
  try {
    await assert.rejects(createModelClient().messages.create(request), error => isPermanentModelError(error));
    const record = getModelCallRecords()[0];
    assert.equal(record.usage_unknown, true);
    assert.equal(record.cost_is_upper_bound, true);
    assert.ok(record.estimated_cost_usd > 0);
  } finally { globalThis.fetch = original; }
});

test('usage-ledger failure is permanent and retains paid response usage', async () => {
  configure();
  process.env.AI_USAGE_LEDGER = '/nonexistent-synthetic-directory/usage.jsonl';
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'paid', model: 'gpt-6-sol', status: 'completed',
    usage: { input_tokens: 100, output_tokens: 10 },
    output: [{ type: 'function_call', name: 'record', arguments: '{"ok":true}' }],
  }), { status: 200 });
  try {
    await assert.rejects(createModelClient().messages.create(request), error => {
      assert.equal(isPermanentModelError(error), true);
      assert.equal((error as { usage: { output_tokens: number } }).usage.output_tokens, 10);
      return true;
    });
    assert.equal(getModelCallRecords()[0].estimated_cost_usd, 0.0003);
  } finally { globalThis.fetch = original; delete process.env.AI_USAGE_LEDGER; }
});

test('invalid cache counts cannot reduce the ledger spend or bypass the cap', async () => {
  configure();
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'invalid-usage', model: 'gpt-6-sol', status: 'completed',
    usage: { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: -1 } },
    output: [{ type: 'function_call', name: 'record', arguments: '{"ok":true}' }],
  }), { status: 200 });
  try {
    await assert.rejects(createModelClient().messages.create(request), error => isPermanentModelError(error));
    const record = getModelCallRecords()[0];
    assert.equal(record.usage_unknown, true);
    assert.equal(record.cost_is_upper_bound, true);
    assert.ok(record.estimated_cost_usd > 0);
  } finally { globalThis.fetch = original; }
});
