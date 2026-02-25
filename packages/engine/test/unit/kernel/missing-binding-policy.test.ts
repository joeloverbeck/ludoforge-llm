import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createEvalError } from '../../../src/kernel/eval-error.js';
import { shouldDeferMissingBinding } from '../../../src/kernel/missing-binding-policy.js';

describe('shouldDeferMissingBinding()', () => {
  it('defers missing-binding errors for supported discovery contexts', () => {
    const missing = createEvalError('MISSING_BINDING', 'missing');
    assert.equal(shouldDeferMissingBinding(missing, 'pipeline.discoveryPredicate'), true);
    assert.equal(shouldDeferMissingBinding(missing, 'legalMoves.executorDuringParamEnumeration'), true);
  });

  it('does not defer non-missing-binding eval errors', () => {
    const missingVar = createEvalError('MISSING_VAR', 'missing var');
    assert.equal(shouldDeferMissingBinding(missingVar, 'pipeline.discoveryPredicate'), false);
    assert.equal(shouldDeferMissingBinding(missingVar, 'legalMoves.executorDuringParamEnumeration'), false);
  });

  it('does not defer arbitrary non-eval errors', () => {
    assert.equal(shouldDeferMissingBinding(new Error('boom'), 'pipeline.discoveryPredicate'), false);
  });

  it('defers unresolved selector-cardinality only for event decision probing', () => {
    const selectorCardinality = createEvalError(
      'SELECTOR_CARDINALITY',
      'Expected exactly one zone',
      { selector: '$targetProvince', resolvedCount: 0, resolvedZones: [] },
    );
    assert.equal(shouldDeferMissingBinding(selectorCardinality, 'legalMoves.eventDecisionSequence'), true);
    assert.equal(shouldDeferMissingBinding(selectorCardinality, 'pipeline.discoveryPredicate'), false);
    assert.equal(shouldDeferMissingBinding(selectorCardinality, 'legalMoves.executorDuringParamEnumeration'), false);
  });
});
