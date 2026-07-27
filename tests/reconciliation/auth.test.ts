import test from 'node:test';
import assert from 'node:assert/strict';
import { reconciliationAuthError } from '../../src/lib/reconciliation/auth';

test('reconciliation auth fails closed when no API key is configured', () => {
  const previous = process.env.RECONCILIATION_API_KEY;
  delete process.env.RECONCILIATION_API_KEY;
  try {
    const response = reconciliationAuthError(new Request('http://localhost/api/reconciliation/run'));
    assert.equal(response?.status, 503);
  } finally {
    if (previous === undefined) delete process.env.RECONCILIATION_API_KEY;
    else process.env.RECONCILIATION_API_KEY = previous;
  }
});

test('reconciliation auth rejects missing and incorrect credentials', () => {
  const previous = process.env.RECONCILIATION_API_KEY;
  process.env.RECONCILIATION_API_KEY = 'expected-secret';
  try {
    assert.equal(reconciliationAuthError(new Request('http://localhost'))?.status, 401);
    assert.equal(reconciliationAuthError(new Request('http://localhost', {
      headers: { authorization: 'Bearer incorrect-secret' },
    }))?.status, 401);
  } finally {
    if (previous === undefined) delete process.env.RECONCILIATION_API_KEY;
    else process.env.RECONCILIATION_API_KEY = previous;
  }
});

test('reconciliation auth accepts bearer and X-API-Key credentials', () => {
  const previous = process.env.RECONCILIATION_API_KEY;
  process.env.RECONCILIATION_API_KEY = 'expected-secret';
  try {
    assert.equal(reconciliationAuthError(new Request('http://localhost', {
      headers: { authorization: 'Bearer expected-secret' },
    })), null);
    assert.equal(reconciliationAuthError(new Request('http://localhost', {
      headers: { 'x-api-key': 'expected-secret' },
    })), null);
  } finally {
    if (previous === undefined) delete process.env.RECONCILIATION_API_KEY;
    else process.env.RECONCILIATION_API_KEY = previous;
  }
});
