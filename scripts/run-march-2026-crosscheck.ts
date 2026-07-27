import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { ReconciliationAuditEvent, ReconciliationModelUsage } from '../src/lib/reconciliation/graph/audit';

interface ApiResult {
  runId: string;
  complete: boolean;
  summary: Record<string, number>;
  confidence_distribution: Record<string, number>;
  judge_flagged: number;
  issues: unknown[];
  usage: ReconciliationModelUsage;
  usage_by_model: Record<string, ReconciliationModelUsage>;
  audit: ReconciliationAuditEvent[];
}

const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus-4-8': { input: 5, output: 25 },
};

function estimatedCost(model: string, usage: ReconciliationModelUsage): number {
  const price = PRICES[model];
  if (!price) return 0;
  return ((usage.input_tokens * price.input) + (usage.output_tokens * price.output) +
    (usage.cache_creation_input_tokens * price.input * 1.25) +
    (usage.cache_read_input_tokens * price.input * 0.1)) / 1_000_000;
}

function json(value: unknown): string { return `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`; }

async function main() {
  const apiKey = process.env.RECONCILIATION_API_KEY?.trim();
  if (!apiKey) throw new Error('RECONCILIATION_API_KEY is missing');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const awards = await pool.query<{ candidate_id: string }>(
    'SELECT candidate_id FROM contracts WHERE search_year=$1 AND search_month=$2 ORDER BY id', [2026, 3],
  );
  const response = await fetch('http://localhost:3000/api/reconciliation/run', {
    method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ external_award_ids: awards.rows.map(row => row.candidate_id), as_of: '2026-03-31T23:59:59Z' }),
    signal: AbortSignal.timeout(60 * 60 * 1000),
  });
  const result = await response.json() as ApiResult & { error?: string };
  if (!response.ok && response.status !== 206) throw new Error(`Cross-check HTTP ${response.status}: ${result.error ?? JSON.stringify(result.issues)}`);

  const checkpoints = await pool.query<{ thread_id: string; count: string }>(`
    SELECT thread_id, COUNT(*)::text AS count FROM checkpoints
    WHERE thread_id LIKE $1 GROUP BY thread_id
  `, [`${result.runId}:%`]);
  await pool.end();
  const checkpointCounts = new Map(checkpoints.rows.map(row => [row.thread_id.slice(result.runId.length + 1), Number(row.count)]));
  const eventsByAward = new Map<string, ReconciliationAuditEvent[]>();
  for (const event of result.audit) eventsByAward.set(event.award_id, [...(eventsByAward.get(event.award_id) ?? []), event]);

  const modelCosts = Object.fromEntries(Object.entries(result.usage_by_model).map(([model, usage]) => [model, estimatedCost(model, usage)]));
  const totalCost = Object.values(modelCosts).reduce((sum, value) => sum + value, 0);
  const reached = (node: string) => new Set(result.audit.filter(event => event.node === node || event.node.startsWith(`${node}.`)).map(event => event.award_id)).size;
  const lines: string[] = [
    '# March 2026 Reconciliation Cross-Check — Full Live Test Run', '',
    `Generated: ${new Date().toISOString()}`, `Run ID: \`${result.runId}\``, '',
    '## Summary', '',
    `- Stored March awards requested: ${awards.rowCount}`,
    `- Awards with captured graph events: ${eventsByAward.size}`,
    `- Complete run: ${result.complete}`,
    `- Judge-flagged: ${result.judge_flagged}`,
    `- Finding distribution: \`${JSON.stringify(result.summary)}\``,
    `- Confidence distribution: \`${JSON.stringify(result.confidence_distribution)}\``,
    `- Node reach: framework_rate_lookup=${reached('framework_rate_lookup')}, buyer_evidence=${reached('buyer_evidence')}, supplier_evidence=${reached('supplier_evidence')}, evidence_judge=${reached('evidence_judge')}, confidence_and_finding=${reached('confidence_and_finding')}, structured_output=${reached('structured_output')}, persist=${reached('persist')}`,
    '', '## Token usage and estimated cost', '',
    `Total usage: \`${JSON.stringify(result.usage)}\``, '',
    '| Model | Input | Output | Cache write | Cache read | Estimated USD |',
    '|---|---:|---:|---:|---:|---:|',
    ...Object.entries(result.usage_by_model).map(([model, usage]) =>
      `| ${model} | ${usage.input_tokens} | ${usage.output_tokens} | ${usage.cache_creation_input_tokens} | ${usage.cache_read_input_tokens} | $${modelCosts[model].toFixed(4)} |`),
    `| **Total** | **${result.usage.input_tokens}** | **${result.usage.output_tokens}** | **${result.usage.cache_creation_input_tokens}** | **${result.usage.cache_read_input_tokens}** | **$${totalCost.toFixed(4)}** |`,
    '', '> Cost estimate assumptions per million tokens: Haiku 4.5 $1 input/$5 output; Sonnet 5 $3/$15; Opus 4.8 $5/$25; cache writes 1.25× input and cache reads 0.1× input. Replace these assumptions if the account has contracted pricing.',
    '', `Projected 71-award cost at the same average: **$${(totalCost * 71 / Math.max(1, awards.rowCount ?? 0)).toFixed(2)}**.`,
    '', '## Run issues', json(result.issues),
  ];

  const nodeOrder = ['framework_rate_lookup.calculate_rebate', 'framework_rate_lookup',
    'buyer_evidence', 'supplier_evidence', 'evidence_judge', 'confidence_and_finding', 'structured_output', 'persist'];
  for (const [awardId, events] of eventsByAward) {
    const award = (events.find(event => event.node === 'framework_rate_lookup')?.input as { award?: Record<string, unknown> } | undefined)?.award;
    lines.push('', `## ${award?.customerRaw ?? award?.customerCanonical ?? 'Unknown organisation'} — ${award?.supplierRaw ?? award?.supplierCanonical ?? 'Unknown supplier'}`, '',
      `Award ID: \`${awardId}\``, '', '### Raw award entering graph', json(award));
    for (const node of nodeOrder) {
      const nodeEvents = events.filter(event => event.node === node);
      lines.push('', `### ${node}`, '');
      if (!nodeEvents.length) { lines.push('Not reached.'); continue; }
      for (const [index, event] of nodeEvents.entries()) {
        lines.push(`Invocation ${index + 1}: model=\`${event.model ?? 'none'}\`, tool=\`${event.tool ?? 'none'}\`, attempt=${event.attempt}`,
          '', '**Complete input**', json(event.input), '**Complete output**', json(event.output),
          `Error: ${event.error ? `\`${event.error}\`` : 'none'}`,
          `Usage: \`${JSON.stringify(event.usage)}\``);
      }
    }
    const failedEvents = events.filter(event => event.error);
    lines.push('', '### Checkpoint and recovery', '',
      `- PostgreSQL checkpoints written: ${checkpointCounts.get(awardId) ?? 0}`,
      `- Node failures recorded: ${failedEvents.length}`,
      `- Retry triggered: ${events.some((event, index) => index > 0 && events.slice(0, index).some(previous => previous.node === event.node))}`,
      '- Resumed after process interruption: false');
  }
  const target = path.join(process.cwd(), 'docs', 'march-2026-test-run.md');
  await writeFile(target, lines.join('\n'), 'utf8');
  console.log(JSON.stringify({ target, runId: result.runId, complete: result.complete, awards: awards.rowCount,
    findingDistribution: result.summary, confidenceDistribution: result.confidence_distribution,
    judgeFlagged: result.judge_flagged, usage: result.usage,
    modelCosts, totalCost, projected71: totalCost * 71 / Math.max(1, awards.rowCount ?? 0), issues: result.issues }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
