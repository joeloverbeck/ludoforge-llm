import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EvalError,
  KernelRuntimeError,
  evalSuccess,
  missingBindingError,
  unwrapEvalCondition,
  unwrapEvalQuery,
} from '../../src/kernel/index.js';
import type { EvalConditionResult, EvalQueryResult } from '../../src/kernel/index.js';

describe('eval result types', () => {
  describe('evalSuccess', () => {
    it('wraps a boolean value', () => {
      const result = evalSuccess(true);
      assert.deepStrictEqual(result, { outcome: 'success', value: true });
    });

    it('wraps a false boolean value', () => {
      const result = evalSuccess(false);
      assert.deepStrictEqual(result, { outcome: 'success', value: false });
    });

    it('wraps an empty query result array', () => {
      const result = evalSuccess([] as readonly number[]);
      assert.deepStrictEqual(result, { outcome: 'success', value: [] });
    });

    it('wraps a non-empty query result array', () => {
      const items: readonly number[] = [1, 2, 3];
      const result = evalSuccess(items);
      assert.equal(result.outcome, 'success');
      assert.strictEqual(result.value, items);
    });
  });

  describe('unwrapEvalCondition', () => {
    it('returns the boolean on success', () => {
      const result: EvalConditionResult = { outcome: 'success', value: true };
      assert.equal(unwrapEvalCondition(result), true);
    });

    it('returns false on success with false value', () => {
      const result: EvalConditionResult = { outcome: 'success', value: false };
      assert.equal(unwrapEvalCondition(result), false);
    });

    it('throws KernelRuntimeError on error outcome', () => {
      const evalError = missingBindingError('binding $x not found');
      const result: EvalConditionResult = { outcome: 'error', error: evalError };
      assert.throws(
        () => unwrapEvalCondition(result),
        (err: unknown) => {
          assert.ok(err instanceof KernelRuntimeError);
          assert.equal(err.code, 'RUNTIME_CONTRACT_INVALID');
          assert.ok(err.message.includes('evalCondition returned error'));
          assert.ok(err.message.includes('binding $x not found'));
          return true;
        },
      );
    });

    it('preserves the original EvalError as cause', () => {
      const evalError = missingBindingError('test');
      const result: EvalConditionResult = { outcome: 'error', error: evalError };
      try {
        unwrapEvalCondition(result);
        assert.fail('should have thrown');
      } catch (err: unknown) {
        assert.ok(err instanceof KernelRuntimeError);
        assert.strictEqual((err as Error & { cause?: unknown }).cause, evalError);
      }
    });
  });

  describe('unwrapEvalQuery', () => {
    it('returns the array on success', () => {
      const items: readonly number[] = [42, 99];
      const result: EvalQueryResult = { outcome: 'success', value: items };
      assert.strictEqual(unwrapEvalQuery(result), items);
    });

    it('returns empty array on success', () => {
      const result: EvalQueryResult = { outcome: 'success', value: [] };
      assert.deepStrictEqual(unwrapEvalQuery(result), []);
    });

    it('throws KernelRuntimeError on error outcome', () => {
      const evalError = missingBindingError('query binding missing');
      const result: EvalQueryResult = { outcome: 'error', error: evalError };
      assert.throws(
        () => unwrapEvalQuery(result),
        (err: unknown) => {
          assert.ok(err instanceof KernelRuntimeError);
          assert.equal(err.code, 'RUNTIME_CONTRACT_INVALID');
          assert.ok(err.message.includes('evalQuery returned error'));
          assert.ok(err.message.includes('query binding missing'));
          return true;
        },
      );
    });

    it('preserves the original EvalError as cause', () => {
      const evalError = missingBindingError('test');
      const result: EvalQueryResult = { outcome: 'error', error: evalError };
      try {
        unwrapEvalQuery(result);
        assert.fail('should have thrown');
      } catch (err: unknown) {
        assert.ok(err instanceof KernelRuntimeError);
        assert.strictEqual((err as Error & { cause?: unknown }).cause, evalError);
      }
    });
  });

  describe('type discrimination', () => {
    it('outcome discriminator enables narrowing on EvalConditionResult', () => {
      const success: EvalConditionResult = { outcome: 'success', value: true };
      const error: EvalConditionResult = {
        outcome: 'error',
        error: missingBindingError('test'),
      };

      if (success.outcome === 'success') {
        const _b: boolean = success.value;
        assert.equal(_b, true);
      }

      if (error.outcome === 'error') {
        assert.ok(error.error instanceof EvalError);
        assert.equal(error.error.code, 'MISSING_BINDING');
      }
    });

    it('outcome discriminator enables narrowing on EvalQueryResult', () => {
      const success: EvalQueryResult = { outcome: 'success', value: [1, 2] as readonly number[] };
      const error: EvalQueryResult = {
        outcome: 'error',
        error: missingBindingError('test'),
      };

      if (success.outcome === 'success') {
        assert.deepStrictEqual(success.value, [1, 2]);
      }

      if (error.outcome === 'error') {
        assert.ok(error.error instanceof EvalError);
      }
    });
  });
});
