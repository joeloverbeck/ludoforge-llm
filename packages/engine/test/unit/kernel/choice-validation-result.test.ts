import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  choiceValidationFailed,
  choiceValidationSuccess,
  type ChoiceValidationResult,
} from '../../../src/kernel/choice-validation-result.js';

describe('ChoiceValidationResult', () => {
  describe('choiceValidationSuccess', () => {
    it('produces a success result with the given value', () => {
      const result = choiceValidationSuccess(42);
      assert.equal(result.outcome, 'success');
      assert.equal(result.value, 42);
    });

    it('preserves complex value types', () => {
      const value = { items: ['a', 'b'], count: 2 } as const;
      const result = choiceValidationSuccess(value);
      assert.equal(result.outcome, 'success');
      assert.deepEqual(result.value, value);
    });
  });

  describe('choiceValidationFailed', () => {
    it('produces an error result with the given message', () => {
      const result = choiceValidationFailed('invalid selection');
      assert.equal(result.outcome, 'error');
      assert.equal(result.error.code, 'CHOICE_RUNTIME_VALIDATION_FAILED');
      assert.equal(result.error.message, 'invalid selection');
      assert.equal(result.error.context, undefined);
    });

    it('includes context when provided', () => {
      const ctx = { effectType: 'chooseN', bind: 'weapon' } as const;
      const result = choiceValidationFailed('bad cardinality', ctx);
      assert.equal(result.outcome, 'error');
      assert.equal(result.error.code, 'CHOICE_RUNTIME_VALIDATION_FAILED');
      assert.equal(result.error.message, 'bad cardinality');
      assert.deepEqual(result.error.context, ctx);
    });

    it('omits context property when not provided', () => {
      const result: ChoiceValidationResult<never> = choiceValidationFailed('msg');
      if (result.outcome === 'error') {
        assert.equal('context' in result.error, false);
      } else {
        assert.fail('expected error');
      }
    });
  });

  describe('discriminant pattern-matching', () => {
    it('narrows to success via outcome check', () => {
      const result: ChoiceValidationResult<number> = choiceValidationSuccess(7);
      if (result.outcome === 'success') {
        assert.equal(result.value, 7);
      } else {
        assert.fail('expected success');
      }
    });

    it('narrows to error via outcome check', () => {
      const result: ChoiceValidationResult<number> = choiceValidationFailed('fail');
      if (result.outcome === 'error') {
        assert.equal(result.error.code, 'CHOICE_RUNTIME_VALIDATION_FAILED');
      } else {
        assert.fail('expected error');
      }
    });
  });
});
