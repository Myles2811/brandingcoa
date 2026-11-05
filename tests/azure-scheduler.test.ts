import test from 'node:test';
import assert from 'node:assert/strict';
import { graph } from '../src/lib/graph';
import { runScheduledJob } from '../src/lib/cron';

function restoreEnvironment(t: test.TestContext) {
  const keys = ['AI_PROVIDER', 'AZURE_OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('Azure-only scheduler credentials reach the scanner graph without an Anthropic key', async t => {
  restoreEnvironment(t);
  process.env.AI_PROVIDER = 'azure_openai';
  process.env.AZURE_OPENAI_API_KEY = 'synthetic-azure-key';
  delete process.env.ANTHROPIC_API_KEY;
  // An incomplete result also verifies that no schedule timestamp is written:
  // this test supplies no database and would fail if updateScheduleRun ran.
  const invoke = t.mock.method(graph, 'invoke', async () => ({
    complete: false, finalResults: [],
  }) as unknown as Awaited<ReturnType<typeof graph.invoke>>);
  t.mock.method(console, 'log', () => {});
  assert.equal(await runScheduledJob(1, 2026, 3, {}), 0);
  assert.equal(invoke.mock.callCount(), 1);
  const input = invoke.mock.calls[0].arguments[0] as { apiKey: string; year: number; month: number };
  assert.equal(input.apiKey, 'synthetic-azure-key');
  assert.equal(input.year, 2026);
  assert.equal(input.month, 3);
});

test('missing Azure key skips a scheduled job even when an unrelated Anthropic key exists', async t => {
  restoreEnvironment(t);
  process.env.AI_PROVIDER = 'azure_openai';
  delete process.env.AZURE_OPENAI_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'synthetic-unrelated-credential';
  const invoke = t.mock.method(graph, 'invoke', async () => {
    throw new Error('The graph must not run without the selected provider credential');
  });
  const log = t.mock.method(console, 'error', () => {});
  assert.equal(await runScheduledJob(1, 2026, 3, {}), 0);
  assert.equal(invoke.mock.callCount(), 0);
  assert.equal(log.mock.callCount(), 1);
  assert.ok(!JSON.stringify(log.mock.calls).includes('synthetic-unrelated-credential'));
});
