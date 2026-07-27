import fs from 'node:fs';
import path from 'node:path';
import { classifyNotices } from '../src/lib/psAwardClassifier';
import { NormalizedNotice } from '../src/lib/types';

interface Fixture { label: boolean; candidate_id: string; buyer_name: string; supplier_name: string; evidence_text: string; framework_hints: string[]; }

async function run() {
  const fixtures = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/ps-awards-eval.json'), 'utf8')) as Fixture[];
  const notices: NormalizedNotice[] = fixtures.map(item => ({
    source: 'find_tender', candidate_id: item.candidate_id, notice_id: item.candidate_id,
    release_id: item.candidate_id, award_id: 'award-1', lot_ids: [], contract_ids: [], ocid: item.candidate_id,
    buyer_name: item.buyer_name, supplier_name: item.supplier_name, contract_description: item.evidence_text,
    award_date: '2026-03-10', publication_date: '2026-03-20', award_value: null, currency: 'GBP',
    notice_url: `https://example.invalid/${encodeURIComponent(item.candidate_id)}`,
    evidence_text: item.evidence_text, framework_hints: item.framework_hints,
  }));
  const outcome = await classifyNotices(notices, 2026, 3, '', process.env.ANTHROPIC_API_KEY ?? '');
  const predicted = new Set(outcome.results.map(result => result.candidate_id));
  const tp = fixtures.filter(item => item.label && predicted.has(item.candidate_id)).length;
  const fp = fixtures.filter(item => !item.label && predicted.has(item.candidate_id)).length;
  const fn = fixtures.filter(item => item.label && !predicted.has(item.candidate_id)).length;
  console.log(JSON.stringify({ complete: outcome.complete, true_positives: tp, false_positives: fp, false_negatives: fn,
    precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, tp + fn), issues: outcome.issues, usage: outcome.usage }, null, 2));
  if (!outcome.complete || fp > 0 || fn > 0) process.exitCode = 1;
}

run().catch(error => { console.error(error); process.exit(1); });
