import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOCDSRelease } from '../src/lib/noticeNormalizer';
import { deduplicateNotices, deduplicateResults } from '../src/lib/dedupeEngine';
import { saveContracts, getContractsByMonth, deleteContract } from '../src/lib/contractsStore';
import { closePool } from '../src/lib/db';
import {
  findSupplierFrameworkSupport, frameworkStatusAt, getFramework,
  getCurrentFrameworkIds, normalizeSupplierName,
} from '../src/lib/frameworkCatalogue';

const release = {
  ocid: 'ocds-test-process', id: 'release-1', date: '2026-03-20T00:00:00Z',
  buyer: { name: 'Test Buyer' },
  tender: {
    title: 'Services', description: 'Core description',
    lots: [{ id: 'lot-1', description: 'Call-off under Y23065' }],
    documents: [{ description: 'KCS Procurement Services framework evidence' }],
  },
  awards: [{
    id: 'award-1', relatedLots: ['lot-1'],
    suppliers: [{ id: 'supplier-a', name: 'Supplier A' }, { id: 'supplier-b', name: 'Supplier B' }],
  }],
  contracts: [{ id: 'contract-1', awardID: 'award-1', dateSigned: '2026-03-10', value: { amount: 100, currency: 'GBP' } }],
};

test('normalizer preserves each supplier award and all evidence locations', () => {
  const notices = normalizeOCDSRelease(release, 'find_tender');
  assert.equal(notices.length, 2);
  assert.equal(new Set(notices.map(notice => notice.candidate_id)).size, 2);
  assert.ok(notices.every(notice => notice.evidence_text.includes('Y23065')));
  assert.ok(notices.every(notice => notice.evidence_text.includes('KCS Procurement Services')));
  assert.deepEqual(notices.map(notice => notice.supplier_name), ['Supplier A', 'Supplier B']);
});

test('exact deduplication keeps distinct awards with the same parties and framework', () => {
  const notices = normalizeOCDSRelease(release, 'find_tender');
  const secondRelease = normalizeOCDSRelease({ ...release, id: 'release-2', awards: [{ ...release.awards[0], id: 'award-2' }] }, 'find_tender');
  assert.equal(deduplicateNotices([...notices, ...secondRelease]).length, 4);
  const results = [...notices, ...secondRelease].map(notice => ({
    ...notice, link: notice.notice_url, evidence_excerpt: notice.evidence_text,
    confidence: 'High' as const, first_seen_timestamp: '2026-03-20T00:00:00Z',
  }));
  assert.equal(deduplicateResults(results).length, 4);
});

test('database stores multiple awards sharing one notice URL', async () => {
  const stamp = Date.now();
  const notices = normalizeOCDSRelease({ ...release, ocid: `ocds-db-${stamp}`, id: `release-${stamp}` }, 'find_tender');
  const results = notices.map(notice => ({
    ...notice, link: `https://example.invalid/shared-${stamp}`,
    evidence_excerpt: notice.evidence_text, confidence: 'High' as const,
    first_seen_timestamp: '2026-03-20T00:00:00Z',
  }));
  assert.equal(await saveContracts(2098, 3, results), 2);
  const stored = (await getContractsByMonth(2098, 3)).filter(row => row.link === results[0].link);
  assert.equal(stored.length, 2);
  for (const row of stored) await deleteContract(row.id);
  await closePool();
});

test('catalogue contains the seven newly audited active frameworks', () => {
  const current = new Set(getCurrentFrameworkIds('2026-07-01T12:00:00Z'));
  for (const id of ['Y23061', 'TPPLPSBUS01', 'Y24007', 'Y26006', 'Y25007', 'Y23060', 'Y23044']) {
    assert.ok(current.has(id), `${id} should be current`);
  }
});

test('expired identifiers remain known but are not current', () => {
  const framework = getFramework('Y21011');
  assert.ok(framework);
  assert.equal(frameworkStatusAt(framework, '2025-11-01T12:00:00Z'), 'expiring');
  assert.equal(frameworkStatusAt(framework, '2026-07-01T12:00:00Z'), 'expired');
  assert.ok(!getCurrentFrameworkIds('2026-07-01T12:00:00Z').includes('Y21011'));
});

test('supplier names and trading variants normalize consistently', () => {
  assert.equal(normalizeSupplierName('Example Solutions (UK) Limited T/A Example'), 'example solutions');
});

test('official supplier catalogue provides supporting framework memberships', () => {
  const support = findSupplierFrameworkSupport('Arg Europe Limited', '2026-07-01T12:00:00Z');
  assert.ok(support.some(item => item.framework_id === 'Y23061'));
});

test('published supplier lot assignments are retained', () => {
  const support = findSupplierFrameworkSupport('Dennis Johns Service Group Ltd', '2026-07-01T12:00:00Z');
  const cctv = support.find(item => item.framework_id === 'Y24007');
  assert.ok(cctv);
  assert.ok(cctv.lots.some(lot => /LOT 1/i.test(lot)));
});
