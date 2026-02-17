import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CANONICAL_BINDING_IDENTIFIER_PATTERN,
  isCanonicalBindingIdentifier,
} from '../../../src/kernel/binding-identifier-contract.js';

describe('binding-identifier-contract', () => {
  it('accepts canonical "$name" identifiers and rejects non-canonical values', () => {
    assert.equal(isCanonicalBindingIdentifier('$seat'), true);
    assert.equal(isCanonicalBindingIdentifier('$x'), true);

    assert.equal(isCanonicalBindingIdentifier('seat'), false);
    assert.equal(isCanonicalBindingIdentifier(''), false);
    assert.equal(isCanonicalBindingIdentifier('   '), false);
  });

  it('exposes the same canonical matcher pattern for schema surfaces', () => {
    assert.equal(CANONICAL_BINDING_IDENTIFIER_PATTERN.test('$player'), true);
    assert.equal(CANONICAL_BINDING_IDENTIFIER_PATTERN.test('player'), false);
  });
});
