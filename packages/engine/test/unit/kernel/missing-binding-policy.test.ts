import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EVAL_ERROR_DEFER_CLASS } from '../../../src/kernel/eval-error-defer-class.js';
import { createEvalError } from '../../../src/kernel/eval-error.js';
import { FREE_OPERATION_ZONE_FILTER_SURFACES } from '../../../src/kernel/free-operation-zone-filter-contract.js';
import {
  shouldDeferFreeOperationZoneFilterFailure,
  shouldDeferMissingBinding,
} from '../../../src/kernel/missing-binding-policy.js';

describe('shouldDeferMissingBinding()', () => {
  it('defers missing-binding errors for supported discovery contexts', () => {
    const missing = createEvalError('MISSING_BINDING', 'missing');
    assert.equal(shouldDeferMissingBinding(missing, 'pipeline.discoveryPredicate'), true);
    assert.equal(shouldDeferMissingBinding(missing, 'legalMoves.executorDuringParamEnumeration'), true);
    assert.equal(shouldDeferMissingBinding(missing, 'legalChoices.freeOperationZoneFilterProbe'), true);
  });

  it('does not defer non-missing-binding eval errors', () => {
    const missingVar = createEvalError('MISSING_VAR', 'missing var');
    assert.equal(shouldDeferMissingBinding(missingVar, 'pipeline.discoveryPredicate'), false);
    assert.equal(shouldDeferMissingBinding(missingVar, 'legalMoves.executorDuringParamEnumeration'), false);
    assert.equal(shouldDeferMissingBinding(missingVar, 'legalChoices.freeOperationZoneFilterProbe'), false);
  });

  it('does not defer arbitrary non-eval errors', () => {
    assert.equal(shouldDeferMissingBinding(new Error('boom'), 'pipeline.discoveryPredicate'), false);
  });

  it('defers structured unresolved-binding selector-cardinality only for event decision probing', () => {
    const selectorCardinality = createEvalError(
      'SELECTOR_CARDINALITY',
      'Expected exactly one zone',
      {
        selectorKind: 'zone',
        selector: 'hand:allOther',
        resolvedCount: 0,
        resolvedZones: [],
        deferClass: EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY,
      },
    );
    assert.equal(shouldDeferMissingBinding(selectorCardinality, 'legalMoves.eventDecisionSequence'), true);
    assert.equal(shouldDeferMissingBinding(selectorCardinality, 'pipeline.discoveryPredicate'), false);
    assert.equal(shouldDeferMissingBinding(selectorCardinality, 'legalMoves.executorDuringParamEnumeration'), false);
  });

  it('does not defer selector-cardinality without structured unresolved-binding metadata', () => {
    const selectorCardinality = createEvalError('SELECTOR_CARDINALITY', 'Expected exactly one zone', {
      selectorKind: 'zone',
      selector: '$targetProvince',
      resolvedCount: 0,
      resolvedZones: [],
    });
    assert.equal(shouldDeferMissingBinding(selectorCardinality, 'legalMoves.eventDecisionSequence'), false);
  });
});

describe('shouldDeferFreeOperationZoneFilterFailure()', () => {
  it('defers missing-binding only on legalChoices surface', () => {
    const missing = createEvalError('MISSING_BINDING', 'missing');
    assert.equal(shouldDeferFreeOperationZoneFilterFailure('legalChoices', missing), true);
    assert.equal(shouldDeferFreeOperationZoneFilterFailure('turnFlowEligibility', missing), false);
  });

  it('does not defer non-missing-binding errors on either surface', () => {
    const missingVar = createEvalError('MISSING_VAR', 'missing var');
    for (const surface of FREE_OPERATION_ZONE_FILTER_SURFACES) {
      assert.equal(shouldDeferFreeOperationZoneFilterFailure(surface, missingVar), false);
    }
  });
});
