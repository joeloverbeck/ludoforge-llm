// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compareByDistanceThenLex,
  levenshteinDistance,
  rankByEditDistance,
} from '../../../src/contracts/edit-distance-contract.js';

describe('edit distance contract', () => {
  it('computes canonical levenshtein identity/insertion/deletion/substitution distances', () => {
    assert.equal(levenshteinDistance('', ''), 0);
    assert.equal(levenshteinDistance('window', 'window'), 0);
    assert.equal(levenshteinDistance('window', 'windows'), 1);
    assert.equal(levenshteinDistance('windows', 'window'), 1);
    assert.equal(levenshteinDistance('kitten', 'sitting'), 3);
  });

  it('orders scored candidates by distance and then lexicographically', () => {
    const scored = [
      { candidate: 'zeta', distance: 2 },
      { candidate: 'beta', distance: 1 },
      { candidate: 'alpha', distance: 1 },
    ];

    const ordered = [...scored].sort(compareByDistanceThenLex);

    assert.deepEqual(ordered, [
      { candidate: 'alpha', distance: 1 },
      { candidate: 'beta', distance: 1 },
      { candidate: 'zeta', distance: 2 },
    ]);
  });

  it('ranks candidates with deterministic tie ordering and returns scored shape', () => {
    const ranked = rankByEditDistance('cat', ['hat', 'bat', 'dog']);

    assert.deepEqual(ranked, [
      { candidate: 'bat', distance: 1 },
      { candidate: 'hat', distance: 1 },
      { candidate: 'dog', distance: 3 },
    ]);
  });

  it('uses locale-independent code-unit ordering for equal-distance ties', () => {
    const ranked = rankByEditDistance('', ['ä', 'z']);
    assert.deepEqual(ranked.map((entry) => entry.candidate), ['z', 'ä']);
  });

  it('does not mutate caller provided candidate arrays', () => {
    const candidates = ['window-a', 'turn-a', 'window-z'];
    const original = [...candidates];

    void rankByEditDistance('window-z', candidates);

    assert.deepEqual(candidates, original);
  });

  it('deduplicates candidate inputs before scoring while preserving deterministic order', () => {
    const ranked = rankByEditDistance('cat', ['hat', 'bat', 'hat', 'bat', 'dog']);
    assert.deepEqual(ranked, [
      { candidate: 'bat', distance: 1 },
      { candidate: 'hat', distance: 1 },
      { candidate: 'dog', distance: 3 },
    ]);
  });
});
