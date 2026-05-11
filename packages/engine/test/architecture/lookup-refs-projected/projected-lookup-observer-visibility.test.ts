// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertProjectedZoneUnknownRef,
  projectedLookupRef,
  readyProjectedState,
  scoreProjectedOption,
} from './projected-lookup-runtime-test-helpers.js';

const privateZoneRef = projectedLookupRef(
  'zones',
  'ZoneId',
  { kind: 'literal', value: 'private-zone:0' },
  ['variables', 'population'],
);

describe('projected lookup observer visibility', () => {
  it('uses the existing observer projection against the projected state', () => {
    const visibleToSeatA = scoreProjectedOption([privateZoneRef], 'public-zone:none', readyProjectedState, 'seatA');
    const hiddenFromSeatB = scoreProjectedOption([privateZoneRef], 'public-zone:none', readyProjectedState, 'seatB');

    assert.equal(visibleToSeatA.score, 17);
    assert.deepEqual([...visibleToSeatA.unknownLookupRefs.entries()], []);
    assert.equal(hiddenFromSeatB.score, 0);
    assert.deepEqual([...hiddenFromSeatB.unknownPreviewRefs.entries()], []);
    assertProjectedZoneUnknownRef([...hiddenFromSeatB.unknownLookupRefs.entries()], 'hidden');
  });
});
