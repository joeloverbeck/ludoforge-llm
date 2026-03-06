import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isEvalErrorCode } from '../../src/kernel/eval-error.js';
import { tokenFilterBooleanArityError } from '../../src/kernel/token-filter-expr-utils.js';
import { mapTokenFilterTraversalToTypeMismatch } from '../../src/kernel/token-filter-runtime-boundary.js';
import type { TokenFilterExpr } from '../../src/kernel/types.js';

describe('token-filter-runtime-boundary', () => {
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
