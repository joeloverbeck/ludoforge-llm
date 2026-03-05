import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildMissingReferenceSuggestion,
  findReferenceAlternatives,
} from '../../../src/contracts/index.js';

describe('missing reference diagnostic contract', () => {
  it('returns nearest alternatives when edit distance is within threshold', () => {
    assert.deepEqual(findReferenceAlternatives('window-z', ['window-a', 'turn-a']), ['window-a']);
  });

  it('returns empty alternatives when no candidate is close enough', () => {
    assert.deepEqual(findReferenceAlternatives('zzz', ['window-a', 'turn-a']), []);
  });

  it('builds did-you-mean suggestion when alternatives exist', () => {
    const result = buildMissingReferenceSuggestion('window-z', ['window-a'], 'Use one of the declared values.');
    assert.equal(result.suggestion, 'Did you mean "window-a"?');
    assert.deepEqual(result.alternatives, ['window-a']);
  });

  it('falls back to provided suggestion when alternatives are absent', () => {
    const result = buildMissingReferenceSuggestion('zzz', ['window-a'], 'Use one of the declared values.');
    assert.equal(result.suggestion, 'Use one of the declared values.');
    assert.equal(result.alternatives, undefined);
  });
});

