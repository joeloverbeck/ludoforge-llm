// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  projectedLookupRef,
  readyProjectedState,
  scoreProjectedOption,
  zonePopulationRef,
} from './projected-lookup-runtime-test-helpers.js';

describe('projected lookup collection coverage', () => {
  it('walks each lookup collection at depth >= 2 against the projected state', () => {
    const refs = [
      zonePopulationRef,
      projectedLookupRef('tokens', 'TokenId', { kind: 'literal', value: 'unit-public' }, ['properties', 'strength']),
      projectedLookupRef('players', 'PlayerId', { kind: 'literal', value: 0 }, ['variables', 'influence']),
      projectedLookupRef('globals', 'string', { kind: 'literal', value: 'morale' }, ['properties', 'value']),
    ];

    const result = scoreProjectedOption(refs, 'public-zone:none', readyProjectedState);

    assert.equal(result.score, 11 + 23 + 13 + 19);
    assert.deepEqual(result.scoreContributions, [
      { termId: 'projected0', contribution: 11 },
      { termId: 'projected1', contribution: 23 },
      { termId: 'projected2', contribution: 13 },
      { termId: 'projected3', contribution: 19 },
    ]);
    assert.deepEqual([...result.unknownPreviewRefs.entries()], []);
    assert.deepEqual([...result.unknownLookupRefs.entries()], []);
  });
});
