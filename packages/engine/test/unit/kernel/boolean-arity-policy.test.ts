import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  booleanArityMessage,
  booleanAritySuggestion,
  isNonEmptyArray,
} from '../../../src/kernel/boolean-arity-policy.js';

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
});
