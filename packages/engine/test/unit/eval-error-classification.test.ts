import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EVAL_ERROR_DEFER_CLASS,
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
      hasEvalErrorDeferClass(deferrable, EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY),
      true,
    );
    assert.equal(
      hasEvalErrorDeferClass(nonDeferrable, EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY),
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
      hasEvalErrorDeferClass(error, EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY),
      true,
    );
  });
});
