import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  booleanArityMessage,
  booleanAritySuggestion,
  isNonEmptyArray,
} from '../../../src/kernel/boolean-arity-policy.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

describe('boolean-arity-policy', () => {
  it('builds deterministic operator arity messages by domain', () => {
    assert.equal(
      booleanArityMessage('condition', 'and'),
      'Condition operator "and" requires at least one condition argument.',
    );
    assert.equal(
      booleanArityMessage('tokenFilter', 'or'),
      'Token filter operator "or" requires at least one expression argument.',
    );
  });

  it('builds deterministic suggestions by domain', () => {
    assert.equal(booleanAritySuggestion('condition'), 'Provide at least one condition in args.');
    assert.equal(booleanAritySuggestion('tokenFilter'), 'Provide one or more token filter expression arguments.');
  });

  it('detects non-empty arrays with tuple type narrowing semantics', () => {
    const empty: readonly number[] = [];
    const single: readonly number[] = [3];

    assert.equal(isNonEmptyArray(empty), false);
    assert.equal(isNonEmptyArray(single), true);
  });

  it('keeps remaining callsites on shared non-empty-array guards', () => {
    const tokenFilterExprUtils = readKernelSource('src/kernel/token-filter-expr-utils.ts');
    const validateConditions = readKernelSource('src/kernel/validate-conditions.ts');

    assert.match(tokenFilterExprUtils, /\bisNonEmptyArray\s*\(/);
    assert.match(validateConditions, /\bisNonEmptyArray\s*\(/);
    assert.doesNotMatch(tokenFilterExprUtils, /args\.length\s*===\s*0/);
    assert.doesNotMatch(validateConditions, /condition\.args\.length\s*===\s*0/);
  });
});
