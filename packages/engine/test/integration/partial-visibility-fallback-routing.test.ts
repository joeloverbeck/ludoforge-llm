// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  makePartialVisibilityDef,
  scorePartialVisibilityConsideration,
  stateWithVisiblePrefix,
} from './fixtures/partial-visibility-fixtures.js';

describe('partial-visibility fallback routing', () => {
  it('routes partial.lowerBound through useLowerBound instead of onUnavailable', () => {
    const scored = score('useLowerBound');

    assert.deepEqual(scored.scoreContributions, [{ termId: 'useLowerBound', contribution: 20 }]);
    assert.deepEqual(scored.scheduleFallbackFired, {
      termId: 'useLowerBound',
      kind: 'useLowerBound',
      value: 2,
      reason: 'partial.lowerBound.visiblePrefixExhausted',
    });
  });

  it('routes partial.lowerBound through noContribution instead of onUnavailable', () => {
    const scored = score('noContribution');

    assert.deepEqual(scored.scoreContributions, [{ termId: 'noContribution', contribution: 0 }]);
    assert.deepEqual(scored.scheduleFallbackFired, {
      termId: 'noContribution',
      kind: 'noContribution',
      reason: 'partial.lowerBound.visiblePrefixExhausted',
    });
  });

  it('routes partial.lowerBound through dropConsideration instead of onUnavailable', () => {
    const scored = score('dropConsideration');

    assert.deepEqual(scored.scoreContributions, []);
    assert.deepEqual(scored.scheduleFallbackFired, {
      termId: 'dropConsideration',
      kind: 'dropConsideration',
      reason: 'partial.lowerBound.visiblePrefixExhausted',
    });
  });

  it('routes partial.lowerBound through constant instead of onUnavailable', () => {
    const scored = score('constant');

    assert.deepEqual(scored.scoreContributions, [{ termId: 'constant', contribution: 70 }]);
    assert.deepEqual(scored.scheduleFallbackFired, {
      termId: 'constant',
      kind: 'constant',
      value: 7,
      reason: 'partial.lowerBound.visiblePrefixExhausted',
    });
  });
});

const def = makePartialVisibilityDef();
const partialState = stateWithVisiblePrefix(def, ['op-1'], ['op-2']);

function score(considerationId: 'useLowerBound' | 'noContribution' | 'dropConsideration' | 'constant') {
  return scorePartialVisibilityConsideration(def, partialState, considerationId);
}
