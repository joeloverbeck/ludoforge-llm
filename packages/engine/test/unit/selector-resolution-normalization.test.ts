import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { effectRuntimeError, isEffectErrorCode } from '../../src/kernel/effect-error.js';
import { missingBindingError } from '../../src/kernel/eval-error.js';
import { normalizeSelectorResolutionError } from '../../src/kernel/selector-resolution-normalization.js';

describe('selector-resolution-normalization', () => {
  it('rethrows existing EffectRuntimeError unchanged', () => {
    const original = effectRuntimeError('variableRuntimeValidationFailed', 'already normalized', {
      effectType: 'setVar',
      scope: 'pvar',
      selector: { chosen: '$actor' },
    });

    assert.throws(
      () =>
        normalizeSelectorResolutionError(original, {
          code: 'variableRuntimeValidationFailed',
          effectType: 'setVar',
          message: 'should not wrap',
          scope: 'pvar',
          payloadField: 'selector',
          payload: { chosen: '$ignored' },
        }),
      (error: unknown) => error === original,
    );
  });

  it('normalizes eval errors with canonical context fields', () => {
    const evalError = missingBindingError('Missing binding: $who', { binding: '$who' });

    assert.throws(
      () =>
        normalizeSelectorResolutionError(evalError, {
          code: 'variableRuntimeValidationFailed',
          effectType: 'setVar',
          message: 'selector resolution failed',
          scope: 'pvar',
          payloadField: 'selector',
          payload: { chosen: '$who' },
          context: { endpoint: 'setVar.player' },
        }),
      (error: unknown) => {
        if (!isEffectErrorCode(error, 'EFFECT_RUNTIME')) {
          return false;
        }

        assert.equal(error.context?.reason, 'variableRuntimeValidationFailed');
        assert.equal(error.context?.effectType, 'setVar');
        assert.equal(error.context?.scope, 'pvar');
        assert.deepEqual(error.context?.selector, { chosen: '$who' });
        assert.equal(error.context?.sourceErrorCode, 'MISSING_BINDING');
        assert.equal(error.context?.endpoint, 'setVar.player');
        assert.equal(error.context?.errorName, 'EvalError');
        assert.equal(error.context?.errorMessage, 'Missing binding: $who');
        return true;
      },
    );
  });

  it('normalizes non-Error throwables into deterministic context', () => {
    assert.throws(
      () =>
        normalizeSelectorResolutionError('unexpected throw', {
          code: 'resourceRuntimeValidationFailed',
          effectType: 'transferVar',
          message: 'zone resolution failed',
          scope: 'zoneVar',
          payloadField: 'zone',
          payload: { zoneExpr: { ref: 'binding', name: '$zone' } },
        }),
      (error: unknown) => {
        if (!isEffectErrorCode(error, 'EFFECT_RUNTIME')) {
          return false;
        }

        assert.equal(error.context?.reason, 'resourceRuntimeValidationFailed');
        assert.equal(error.context?.effectType, 'transferVar');
        assert.equal(error.context?.scope, 'zoneVar');
        assert.equal(error.context?.thrown, 'unexpected throw');
        assert.deepEqual(error.context?.zone, { zoneExpr: { ref: 'binding', name: '$zone' } });
        return true;
      },
    );
  });
});
