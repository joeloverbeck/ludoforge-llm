import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isEvalErrorCode } from '../../src/kernel/eval-error.js';
import {
  isTokenFilterTraversalError,
  normalizeTokenFilterTraversalError,
  tokenFilterBooleanArityError,
  type TokenFilterTraversalErrorReason,
  walkTokenFilterExpr,
} from '../../src/kernel/token-filter-expr-utils.js';
import { mapTokenFilterTraversalToTypeMismatch } from '../../src/kernel/token-filter-runtime-boundary.js';
import type { TokenFilterExpr } from '../../src/kernel/types.js';

describe('token-filter-runtime-boundary', () => {
  it('normalizes traversal errors with deterministic mapping metadata', () => {
    const emptyArgsError = tokenFilterBooleanArityError(
      { op: 'or', args: [] } as unknown as TokenFilterExpr,
      'or',
      [{ kind: 'arg', index: 2 }],
    );

    const collectTraversalError = (expr: TokenFilterExpr) => {
      try {
        walkTokenFilterExpr(expr, () => {});
        assert.fail('expected traversal error');
      } catch (error) {
        assert.ok(isTokenFilterTraversalError(error));
        return error;
      }
    };

    const unsupportedOperatorError = collectTraversalError({ op: 'xor' } as unknown as TokenFilterExpr);
    const nonConformingNodeError = collectTraversalError({ op: 'and' } as unknown as TokenFilterExpr);

    const normalizedByReason: Record<TokenFilterTraversalErrorReason, ReturnType<typeof normalizeTokenFilterTraversalError>> = {
      empty_args: normalizeTokenFilterTraversalError(emptyArgsError),
      unsupported_operator: normalizeTokenFilterTraversalError(unsupportedOperatorError),
      non_conforming_node: normalizeTokenFilterTraversalError(nonConformingNodeError),
    };

    assert.deepEqual(normalizedByReason.empty_args, {
      reason: 'empty_args',
      op: 'or',
      entryPathSuffix: '.args[2]',
      errorFieldSuffix: '.args',
    });
    assert.deepEqual(normalizedByReason.unsupported_operator, {
      reason: 'unsupported_operator',
      op: 'xor',
      entryPathSuffix: '',
      errorFieldSuffix: '.op',
    });
    assert.deepEqual(normalizedByReason.non_conforming_node, {
      reason: 'non_conforming_node',
      op: 'and',
      entryPathSuffix: '',
      errorFieldSuffix: '.op',
    });
  });

  it('maps token-filter traversal errors to TYPE_MISMATCH with preserved context', () => {
    const expr = { op: 'and', args: [] } as unknown as TokenFilterExpr;
    const traversalError = tokenFilterBooleanArityError(expr, 'and');

    assert.throws(
      () => mapTokenFilterTraversalToTypeMismatch(traversalError),
      (error: unknown) =>
        isEvalErrorCode(error, 'TYPE_MISMATCH')
        && error.message === traversalError.message
        && error.context?.reason === 'empty_args'
        && error.context?.op === 'and'
        && Array.isArray(error.context?.path)
        && error.context?.entryPathSuffix === ''
        && error.context?.errorFieldSuffix === '.args',
    );
  });

  it('preserves traversal error message source for runtime TYPE_MISMATCH mapping', () => {
    const traversalError = {
      code: 'TOKEN_FILTER_TRAVERSAL_ERROR',
      message: 'custom traversal message from upstream source',
      context: {
        expr: { op: 'xor' },
        op: 'xor',
        path: [] as const,
        reason: 'unsupported_operator' as const,
      },
    };

    assert.throws(
      () => mapTokenFilterTraversalToTypeMismatch(traversalError),
      (error: unknown) =>
        isEvalErrorCode(error, 'TYPE_MISMATCH')
        && error.message === traversalError.message
        && error.context?.entryPathSuffix === ''
        && error.context?.errorFieldSuffix === '.op',
    );
  });

  it('rethrows non-traversal errors unchanged', () => {
    const original = new Error('boom');

    assert.throws(
      () => mapTokenFilterTraversalToTypeMismatch(original),
      (error: unknown) => error === original,
    );
  });
});
