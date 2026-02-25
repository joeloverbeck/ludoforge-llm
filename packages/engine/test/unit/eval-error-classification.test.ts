import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EVAL_ERROR_DEFER_CLASS,
  EVAL_ERROR_DEFER_CLASSES_BY_CODE,
  type EvalErrorContextForCode,
  asZoneId,
  divisionByZeroError,
  hasEvalErrorDeferClass,
  isRecoverableEvalResolutionError,
  missingBindingError,
  missingVarError,
  selectorCardinalityError,
  typeMismatchError,
} from '../../src/kernel/index.js';

describe('eval error classification', () => {
  it('classifies recoverable eval resolution errors', () => {
    assert.equal(isRecoverableEvalResolutionError(missingBindingError('missing binding')), true);
    assert.equal(isRecoverableEvalResolutionError(missingVarError('missing var')), true);
    assert.equal(isRecoverableEvalResolutionError(divisionByZeroError('division by zero')), true);
    assert.equal(isRecoverableEvalResolutionError(typeMismatchError('bad type')), false);
    assert.equal(isRecoverableEvalResolutionError(new Error('plain')), false);
  });

  it('classifies selector-cardinality defer classes via typed guard', () => {
    const deferrable = selectorCardinalityError('Expected one', {
      selectorKind: 'zone',
      selector: '$zones',
      resolvedCount: 0,
      resolvedZones: [],
      deferClass: EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY,
    });
    const nonDeferrable = selectorCardinalityError('Expected one', {
      selectorKind: 'zone',
      selector: 'hand:all',
      resolvedCount: 2,
      resolvedZones: [asZoneId('hand:0'), asZoneId('hand:1')],
    });

    assert.equal(
      hasEvalErrorDeferClass(
        deferrable,
        'SELECTOR_CARDINALITY',
        EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY,
      ),
      true,
    );
    assert.equal(
      hasEvalErrorDeferClass(
        nonDeferrable,
        'SELECTOR_CARDINALITY',
        EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY,
      ),
      false,
    );
  });

  it('preserves defer metadata when selector-cardinality context is provided via typed contract', () => {
    const typedContext: EvalErrorContextForCode<'SELECTOR_CARDINALITY'> = {
      selectorKind: 'zone',
      selector: '$zones',
      resolvedCount: 0,
      resolvedZones: [],
      deferClass: EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY,
    };
    const error = selectorCardinalityError('Expected one', typedContext);

    assert.equal(error.context?.deferClass, EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY);
    assert.equal(
      hasEvalErrorDeferClass(
        error,
        'SELECTOR_CARDINALITY',
        EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY,
      ),
      true,
    );
  });

  it('accepts all defer classes declared by the canonical taxonomy map', () => {
    for (const deferClass of EVAL_ERROR_DEFER_CLASSES_BY_CODE.SELECTOR_CARDINALITY) {
      const error = selectorCardinalityError('Expected one', {
        selectorKind: 'zone',
        selector: '$zones',
        resolvedCount: 0,
        resolvedZones: [],
        deferClass,
      });
      assert.equal(hasEvalErrorDeferClass(error, 'SELECTOR_CARDINALITY', deferClass), true);
    }
  });

  it('rejects selector-cardinality defer classes not listed in canonical taxonomy map', () => {
    const forgedUnlistedDeferClass = 'forgedUnlistedDeferClass' as (typeof EVAL_ERROR_DEFER_CLASS)[keyof typeof EVAL_ERROR_DEFER_CLASS];
    const error = selectorCardinalityError('Expected one', {
      selectorKind: 'zone',
      selector: '$zones',
      resolvedCount: 0,
      resolvedZones: [],
      deferClass: forgedUnlistedDeferClass,
    } as EvalErrorContextForCode<'SELECTOR_CARDINALITY'>);

    assert.equal(hasEvalErrorDeferClass(error, 'SELECTOR_CARDINALITY', forgedUnlistedDeferClass), false);
  });
});
