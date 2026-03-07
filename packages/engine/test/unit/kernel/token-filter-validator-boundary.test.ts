import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isTokenFilterTraversalError,
  normalizeTokenFilterTraversalError,
  tokenFilterBooleanArityError,
  walkTokenFilterExpr,
} from '../../../src/kernel/token-filter-expr-utils.js';
import {
  tokenFilterTraversalValidatorMessage,
  tokenFilterTraversalValidatorSuggestion,
} from '../../../src/kernel/token-filter-validator-boundary.js';
import type { TokenFilterExpr } from '../../../src/kernel/types.js';

const collectTraversalError = (expr: TokenFilterExpr) => {
  try {
    walkTokenFilterExpr(expr, () => {});
    assert.fail('expected traversal error');
  } catch (error) {
    assert.ok(isTokenFilterTraversalError(error));
    return error;
  }
};

describe('token-filter-validator-boundary', () => {
  it('maps traversal reasons to deterministic validator messages/suggestions', () => {
    const emptyArgs = normalizeTokenFilterTraversalError(
      tokenFilterBooleanArityError({ op: 'or', args: [] } as unknown as TokenFilterExpr, 'or'),
    );
    const unsupportedOperator = normalizeTokenFilterTraversalError(
      collectTraversalError({ op: 'xor' } as unknown as TokenFilterExpr),
    );
    const nonConformingNode = normalizeTokenFilterTraversalError(
      collectTraversalError({ op: 'and' } as unknown as TokenFilterExpr),
    );

    assert.equal(
      tokenFilterTraversalValidatorMessage(emptyArgs),
      'Token filter operator "or" requires at least one expression argument.',
    );
    assert.equal(
      tokenFilterTraversalValidatorSuggestion(emptyArgs),
      'Provide one or more token filter expression arguments.',
    );

    assert.equal(
      tokenFilterTraversalValidatorMessage(unsupportedOperator),
      'Unsupported token filter operator "xor".',
    );
    assert.equal(
      tokenFilterTraversalValidatorSuggestion(unsupportedOperator),
      'Use one of: and, or, not.',
    );

    assert.equal(
      tokenFilterTraversalValidatorMessage(nonConformingNode),
      'Malformed token filter expression node for operator "and".',
    );
    assert.equal(
      tokenFilterTraversalValidatorSuggestion(nonConformingNode),
      'Use a predicate leaf or a well-formed and/or/not expression node.',
    );
  });
});
