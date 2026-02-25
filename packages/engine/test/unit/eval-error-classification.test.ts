import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EVAL_ERROR_DEFER_CLASS,
  EVAL_ERROR_DEFER_CLASSES_BY_CODE,
  type EvalErrorCodeWithDeferClass,
  type EvalErrorDeferClassForCode,
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

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled defer taxonomy code fixture: ${String(value)}`);
}

function createEvalErrorWithDeferClass(
  code: EvalErrorCodeWithDeferClass,
  deferClass: string,
) {
  switch (code) {
    case 'SELECTOR_CARDINALITY':
      return selectorCardinalityError('Expected one', {
        selectorKind: 'zone',
        selector: '$zones',
        resolvedCount: 0,
        resolvedZones: [],
        deferClass: deferClass as EvalErrorDeferClassForCode<'SELECTOR_CARDINALITY'>,
      } as EvalErrorContextForCode<'SELECTOR_CARDINALITY'>);
    default:
      return assertUnreachable(code);
  }
}

function hasMappedDeferClass(
  error: unknown,
  code: EvalErrorCodeWithDeferClass,
  deferClass: string,
): boolean {
  switch (code) {
    case 'SELECTOR_CARDINALITY':
      return hasEvalErrorDeferClass(error, code, deferClass as EvalErrorDeferClassForCode<'SELECTOR_CARDINALITY'>);
    default:
      return assertUnreachable(code);
  }
}

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
    const entries = Object.entries(EVAL_ERROR_DEFER_CLASSES_BY_CODE) as readonly [
      EvalErrorCodeWithDeferClass,
      readonly string[],
    ][];

    for (const [code, deferClasses] of entries) {
      for (const deferClass of deferClasses) {
        const error = createEvalErrorWithDeferClass(code, deferClass);
        assert.equal(hasMappedDeferClass(error, code, deferClass), true);
      }
    }
  });

  it('rejects forged defer classes not listed in canonical taxonomy map for each mapped code', () => {
    const forgedUnlistedDeferClass = 'forgedUnlistedDeferClass' as (typeof EVAL_ERROR_DEFER_CLASS)[keyof typeof EVAL_ERROR_DEFER_CLASS];
    const codes = Object.keys(EVAL_ERROR_DEFER_CLASSES_BY_CODE) as readonly EvalErrorCodeWithDeferClass[];

    for (const code of codes) {
      const error = createEvalErrorWithDeferClass(code, forgedUnlistedDeferClass);
      assert.equal(hasMappedDeferClass(error, code, forgedUnlistedDeferClass), false);
    }
  });
});
