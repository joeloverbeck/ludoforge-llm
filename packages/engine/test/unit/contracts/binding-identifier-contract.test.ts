import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rankBindingIdentifierAlternatives } from '../../../src/contracts/index.js';

describe('binding identifier contract alternatives', () => {
  it('ranks alternatives by edit distance and then lexicographically', () => {
    assert.deepEqual(
      rankBindingIdentifierAlternatives('$row', ['$raw', '$rou', '$rod', '$zzz']),
      ['$raw', '$rod', '$rou', '$zzz'],
    );
  });

  it('deduplicates and honors explicit limit', () => {
    assert.deepEqual(
      rankBindingIdentifierAlternatives('$seat', ['$seat', '$seat', '$seats', '$zzz'], 2),
      ['$seat', '$seats'],
    );
  });

  it('returns duplicate-free alternatives for duplicate inputs under canonical shared policy', () => {
    assert.deepEqual(
      rankBindingIdentifierAlternatives('$cat', ['$hat', '$bat', '$hat', '$bat', '$dog']),
      ['$bat', '$hat', '$dog'],
    );
  });
});
