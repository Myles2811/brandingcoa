import test from 'node:test';
import assert from 'node:assert/strict';
import { realAwardKey } from '../../src/lib/awardIdentity';

const base = {
  buyer_name: 'Scottish Police Authority', supplier_name: 'IONIC Rescue Ltd',
  award_date: '2026-02-26T00:00:00Z', award_value: 159600, currency: 'GBP',
  framework_hints: ['Y23046'], notice_url: 'https://example.test/notice/MAR552053',
};

test('legacy display prefixes do not create a second real-award identity', () => {
  assert.equal(
    realAwardKey({ ...base, contract_description: '[Award date: February 2026 — notice published in March 2026] Life Jacket Servicing' }),
    realAwardKey({ ...base, contract_description: 'Life Jacket Servicing' }),
  );
});

test('distinct notices with otherwise identical award fields remain distinct', () => {
  assert.notEqual(
    realAwardKey({ ...base, contract_description: 'Life Jacket Servicing', notice_url: 'https://example.test/notice/one' }),
    realAwardKey({ ...base, contract_description: 'Life Jacket Servicing', notice_url: 'https://example.test/notice/two' }),
  );
});
