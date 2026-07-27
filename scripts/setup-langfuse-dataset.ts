/**
 * One-time setup script — run once to create the Langfuse dataset and seed
 * the baseline evaluation scenarios.
 *
 * Usage:
 *   npx tsx scripts/setup-langfuse-dataset.ts
 */

import Langfuse from 'langfuse';
import { VALIDATION_RULES } from '../src/lib/langfuseEval';

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

// ─── Step 1: Create dataset ────────────────────────────────────────────────────
async function createDataset() {
  await langfuse.createDataset({
    name: 'ps-awards-search-eval',
    description:
      'Evaluation dataset for PS awards search — validates structure, business rules, and cost per run',
    metadata: {
      version: '1.0',
      owner: 'procurement-services',
      created: new Date().toISOString(),
    },
  });
  console.log('Dataset created: ps-awards-search-eval');
}

// ─── Step 2: Seed baseline scenarios ──────────────────────────────────────────
async function seedDatasetItems() {
  const scenarios = [
    {
      name: 'February 2026 — full scan',
      input: { year: 2026, month: 2, frameworkId: null, useContractsFinderCrossCheck: true },
      expectedOutput: VALIDATION_RULES,
      metadata: { scenario_type: 'monthly_full_scan', notes: 'Baseline — Feb 2026, all frameworks' },
    },
    {
      name: 'April 2026 — full scan',
      input: { year: 2026, month: 4, frameworkId: null, useContractsFinderCrossCheck: true },
      expectedOutput: VALIDATION_RULES,
      metadata: { scenario_type: 'monthly_full_scan', notes: 'Current month run' },
    },
    {
      name: 'February 2026 — framework Y23049',
      input: { year: 2026, month: 2, frameworkId: 'Y23049', useContractsFinderCrossCheck: true },
      expectedOutput: { ...VALIDATION_RULES, framework_id_present_in_hints: 'Y23049' },
      metadata: { scenario_type: 'framework_specific_scan', notes: 'EV Infrastructure framework filter' },
    },
    {
      name: 'March 2026 — Find a Tender only',
      input: { year: 2026, month: 3, frameworkId: null, useContractsFinderCrossCheck: false },
      expectedOutput: VALIDATION_RULES,
      metadata: { scenario_type: 'find_a_tender_only', notes: 'No Contracts Finder cross-check' },
    },
  ];

  for (const s of scenarios) {
    await langfuse.createDatasetItem({
      datasetName: 'ps-awards-search-eval',
      input: s.input,
      expectedOutput: s.expectedOutput,
      metadata: s.metadata,
    });
    console.log(`  Item seeded: ${s.name}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Setting up Langfuse evaluation dataset...\n');
  await createDataset();
  await seedDatasetItems();
  await langfuse.flushAsync();
  console.log('\nSetup complete — view at Langfuse UI → Datasets → ps-awards-search-eval');
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
