// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  depthCappedProjectedState,
  assertProjectedZoneUnknownRef,
  readyProjectedState,
  scoreProjectedOption,
  zonePopulationRef,
} from './projected-lookup-runtime-test-helpers.js';

describe('projected lookup ready-endpoint-only routing', () => {
  it('resolves against DriveResult.state only for ready projected endpoints', () => {
    const ready = scoreProjectedOption([zonePopulationRef], 'public-zone:none', readyProjectedState);

    assert.equal(ready.score, 11);
    assert.deepEqual(ready.scoreContributions, [{ termId: 'projected0', contribution: 11 }]);
    assert.deepEqual([...ready.unknownPreviewRefs.entries()], []);
    assert.deepEqual([...ready.unknownLookupRefs.entries()], []);
  });

  it('does not read a depth-capped DriveResult.state as a valid endpoint', () => {
    const depthCapped = scoreProjectedOption([zonePopulationRef], 'public-zone:none', depthCappedProjectedState);

    assert.equal(depthCapped.score, 0);
    assert.deepEqual(depthCapped.scoreContributions, []);
    assertProjectedZoneUnknownRef([...depthCapped.unknownPreviewRefs.entries()], 'depthCap');
    assert.deepEqual([...depthCapped.unknownLookupRefs.entries()], []);
    assert.deepEqual(depthCapped.previewFallbackFired, { termId: 'projected0', kind: 'noContribution' });
  });
});
