import assert from 'node:assert/strict';
import { after, test } from 'node:test';

// These requests use an invented credential and mocked transport; no provider call
// is made by this regression suite.
const environment = { ...process.env };
process.env.AI_PROVIDER = 'azure_openai';
process.env.AZURE_OPENAI_BASE_URL = 'https://azure-unit-test.invalid/openai/v1/';
process.env.AZURE_OPENAI_API_KEY = 'unit-test-credential';
delete process.env.ANTHROPIC_API_KEY;
after(() => {
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
});

const modules = Promise.all([
  import('../src/lib/reconciliation/graph/modelCall'),
  import('../src/lib/reconciliation/graph/audit'),
  import('../src/lib/reconciliation/graph/nodes/structuredOutput'),
]);
type ReconciliationGraphState = import('../src/lib/reconciliation/graph/state').ReconciliationGraphState;

function modelResponse(model: string, tool: string, input: unknown): Response {
  return Response.json({
    id: 'resp_synthetic', object: 'response', status: 'completed', model,
    output: [{ type: 'function_call', id: 'fc_synthetic', call_id: 'call_synthetic',
      name: tool, arguments: JSON.stringify(input) }],
    usage: { input_tokens: 120, output_tokens: 15,
      input_tokens_details: { cached_tokens: 20 }, output_tokens_details: { reasoning_tokens: 3 } },
  });
}

test('Azure reconciliation uses the tiered deployments and Azure resource credential', async () => {
  const [{ RECONCILIATION_MODELS, reconciliationApiKey }] = await modules;
  assert.deepEqual(RECONCILIATION_MODELS, {
    frameworkRateLookup: 'gpt-6-luna', buyerEvidence: 'gpt-6.1-sol',
    supplierEvidence: 'gpt-6-luna', evidenceJudge: 'gpt-6-astra',
    confidenceAndFinding: 'gpt-6-luna', structuredOutput: 'gpt-6-luna',
  });
  assert.equal(reconciliationApiKey(), 'unit-test-credential');
});

test('paid responses remain in the audit when validation fails before a retry', async () => {
  const [{ callForcedTool, reconciliationApiKey }, { auditUsage, beginRunAudit, getRunAudit }] = await modules;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => modelResponse('gpt-6-luna', 'record_result', { valid: ++calls > 1 });
  const runId = 'paid-validation-retry';
  beginRunAudit(runId);
  try {
    const output = await callForcedTool({
      apiKey: reconciliationApiKey(), model: 'gpt-6-luna', system: 'Synthetic validation regression.',
      tool: { name: 'record_result', input_schema: { type: 'object',
        properties: { valid: { type: 'boolean' } }, required: ['valid'], additionalProperties: false } },
      input: {}, audit: { runId, awardId: 'synthetic-award', node: 'synthetic' },
      validate(value) {
        if (!(value as { valid: boolean }).valid) throw new Error('source evidence did not validate');
        return value;
      },
    });
    assert.deepEqual(output, { valid: true });
    const events = getRunAudit(runId);
    assert.equal(calls, 2);
    assert.match(events[0].error ?? '', /source evidence did not validate/);
    assert.ok(events[0].usage, 'the billed, rejected response must retain token usage');
    const usage = auditUsage(events);
    assert.equal(usage.input_tokens + usage.cache_read_input_tokens, 240);
    assert.equal(usage.output_tokens, 30);
  } finally { globalThis.fetch = originalFetch; }
});

test('authentication failures are recorded once without a futile paid retry', async () => {
  const [{ callForcedTool, reconciliationApiKey }, { beginRunAudit, getRunAudit }] = await modules;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ error: { code: 'Unauthorized', message: 'Synthetic invalid authentication' } }, { status: 401 });
  };
  const runId = 'permanent-auth-failure';
  beginRunAudit(runId);
  try {
    await assert.rejects(callForcedTool({
      apiKey: reconciliationApiKey(), model: 'gpt-6-luna', system: 'Synthetic auth regression.',
      tool: { name: 'record_result', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
      input: {}, validate: value => value, audit: { runId, awardId: 'synthetic-award', node: 'synthetic' },
    }));
    assert.equal(calls, 1);
    assert.equal(getRunAudit(runId).length, 1);
    assert.equal(getRunAudit(runId)[0].usage, null);
  } finally { globalThis.fetch = originalFetch; }
});

test('strict final output retains complete nested buyer, supplier and judge evidence', async () => {
  const [, { beginRunAudit }, { authoritativeCaseInput, CASE_OUTPUT_TOOL, structuredOutputNode }] = await modules;
  const state: ReconciliationGraphState = {
    runId: 'nested-output', traceId: '', asOf: '2026-03-31T23:59:59Z',
    award: { id: 'synthetic-award', source: 'synthetic', ocid: null, releaseId: 'release', awardId: 'award',
      lotIds: [], contractIds: [], customerRaw: 'Example Council', customerCanonical: 'example council',
      supplierRaw: 'Example Supplier', supplierCanonical: 'example supplier', frameworkReferences: ['Y23065'],
      title: 'Synthetic test', awardDate: null, publicationDate: '2026-03-01', awardValue: '1000',
      currency: 'GBP', confidence: 'High', evidence: 'Synthetic framework call-off', sourceUrl: 'https://example.invalid/' },
    frameworkRate: null, entityResolution: null,
    buyerEvidence: { verdict: 'COA_CONFIRMED', matched_tab: 'Synthetic', matched_row_reference: 'Synthetic row 1',
      caa_value: null, coa_value: 'Yes', evidence_excerpt: 'Synthetic source confirms COA',
      award_date: null, expiry_date: null, ambiguity_note: null },
    supplierEvidence: { verdict: 'NO_CYCLE_DEFINED', matched_tab: 'Synthetic', matched_supplier_row: 'Synthetic row 2',
      last_spend_entry_month: null, last_spend_amount: null, framework_due_months: null,
      evidence_excerpt: 'Synthetic source has no cycle' },
    judgeResult: { buyer_evidence_pass: true, buyer_evidence_fail_reason: null,
      supplier_evidence_pass: true, supplier_evidence_fail_reason: null,
      cross_evidence_conflict: false, cross_evidence_conflict_note: null },
    finding: { finding_code: 'COA_NO_SUPPLIER_SPEND', confidence_tier: 'MEDIUM',
      potential_rebate_lifetime_max: null, reasoning_summary: 'Synthetic' },
    output: null, buyerAttempts: 1, supplierAttempts: 1, judgeFlagged: false, errors: [],
  };
  const input = { ...authoritativeCaseInput(state), schema_complete: true, missing_fields: [] };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    const parameters = request.tools[0].parameters;
    for (const field of ['buyer_evidence', 'supplier_evidence', 'judge_result']) {
      assert.equal(parameters.properties[field].additionalProperties, false);
      assert.ok(Object.keys(parameters.properties[field].properties).length > 0);
      assert.deepEqual(parameters.properties[field].required,
        Object.keys(parameters.properties[field].properties));
    }
    return modelResponse('gpt-6-luna', CASE_OUTPUT_TOOL.name, input);
  };
  beginRunAudit(state.runId);
  try {
    const result = await structuredOutputNode(state);
    assert.deepEqual(result.output?.buyer_evidence, state.buyerEvidence);
    assert.deepEqual(result.output?.supplier_evidence, state.supplierEvidence);
    assert.deepEqual(result.output?.judge_result, state.judgeResult);
  } finally { globalThis.fetch = originalFetch; }
});
