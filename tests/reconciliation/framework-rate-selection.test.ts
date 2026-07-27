import test from 'node:test';
import assert from 'node:assert/strict';
import { selectFrameworkRuleCandidates } from '../../src/lib/reconciliation/graph/nodes/frameworkRateLookup';
import { FrameworkRule } from '../../src/lib/reconciliation/types';

function rule(reference: string, name: string): FrameworkRule {
  return {
    id: reference, frameworkReference: reference, frameworkName: name, category: 'Education',
    rebateRate: '0.0075', validFrom: null, validTo: null, reportingFrequency: 'monthly',
    reportingLagDays: 0, graceDays: 0, sourceSnapshotId: 'snapshot', sourceWorksheet: 'Rules', sourceRow: 1,
  };
}

test('exact framework reference takes precedence over duplicate framework names', () => {
  const rules = [rule('Y24024', 'Education Management Systems'), rule('Y25012', 'Education Management Systems')];
  assert.deepEqual(
    selectFrameworkRuleCandidates(rules, 'Y25012', 'Education Management Systems').map(item => item.frameworkReference),
    ['Y25012'],
  );
});

test('framework name is only used when no exact reference exists', () => {
  const rules = [rule('Y24024', 'Education Management Systems'), rule('Y25012', 'Education Management Systems')];
  assert.equal(selectFrameworkRuleCandidates(rules, 'Y99999', 'Education Management Systems').length, 2);
});
