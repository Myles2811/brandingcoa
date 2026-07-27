import test from 'node:test';
import assert from 'node:assert/strict';
import { authoritativeCaseInput } from '../../src/lib/reconciliation/graph/nodes/structuredOutput';
import { ReconciliationGraphState } from '../../src/lib/reconciliation/graph/state';

const state = {
  award: {
    id: 'award-1', customerRaw: 'Peterborough City Council', customerCanonical: 'peterborough city council',
    supplierRaw: 'MRI Software Ltd', supplierCanonical: 'mri software', frameworkReferences: ['Y23065'],
    source: 'find_tender', awardValue: '1457198',
  },
  entityResolution: null,
  frameworkRate: { framework_ref: 'Y23065' },
  finding: { finding_code: 'AMBIGUOUS_MATCH', confidence_tier: 'LOW', potential_rebate_lifetime_max: null },
  buyerEvidence: null, supplierEvidence: null, judgeResult: null, judgeFlagged: false,
} as unknown as ReconciliationGraphState;

test('structured output uses verbatim award identities instead of local entity substitutions', () => {
  const output = authoritativeCaseInput(state);
  assert.equal(output.organisation, 'Peterborough City Council');
  assert.equal(output.supplier, 'MRI Software Ltd');
  assert.equal(output.finding_code, 'AMBIGUOUS_MATCH');
  assert.equal(output.identity_confirmed, true);
});
