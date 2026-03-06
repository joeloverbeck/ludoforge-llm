import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isEvalErrorCode } from '../../src/kernel/eval-error.js';
import {
  isTokenFilterTraversalError,
  normalizeTokenFilterTraversalError,
  tokenFilterBooleanArityError,
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

    assert.deepEqual(normalizeTokenFilterTraversalError(emptyArgsError), {
      reason: 'empty_args',
      op: 'or',
      entryPathSuffix: '.args[2]',
      errorFieldSuffix: '.args',
      message: 'Token filter operator "or" requires at least one expression argument.',
      suggestion: 'Provide one or more token filter expression arguments.',
    });
    assert.equal(normalizeTokenFilterTraversalError(unsupportedOperatorError).reason, 'unsupported_operator');
    assert.equal(normalizeTokenFilterTraversalError(unsupportedOperatorError).errorFieldSuffix, '.op');
    assert.equal(normalizeTokenFilterTraversalError(unsupportedOperatorError).message, 'Unsupported token filter operator "xor".');
    assert.equal(normalizeTokenFilterTraversalError(unsupportedOperatorError).suggestion, 'Use one of: and, or, not.');
    assert.equal(normalizeTokenFilterTraversalError(nonConformingNodeError).reason, 'non_conforming_node');
    assert.equal(normalizeTokenFilterTraversalError(nonConformingNodeError).errorFieldSuffix, '.op');
    assert.equal(
      normalizeTokenFilterTraversalError(nonConformingNodeError).message,
      'Malformed token filter expression node for operator "and".',
    );
    assert.equal(
      normalizeTokenFilterTraversalError(nonConformingNodeError).suggestion,
      'Use a predicate leaf or a well-formed and/or/not expression node.',
    );
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
        && Array.isArray(error.context?.path),
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
