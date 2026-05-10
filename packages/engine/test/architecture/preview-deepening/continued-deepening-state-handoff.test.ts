// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { capturePreview } from './continued-deepening-fixture.js';

describe('continued deepening state handoff', () => {
  it('continues from the broad checkpoint without replaying the broad prefix', () => {
    const preview = capturePreview('continuedDeepening');

    assert.equal(preview.usage.coverage.broad?.unavailableRootOptionCount, 3);
    assert.equal(preview.usage.coverage.deep?.triggerFired, 'allRequestedRefsDepthCapped');
    assert.deepEqual(preview.run.options.map((option) => option.driveDepth), [3, 3, 3]);
    assert.ok(preview.run.options.every((option) => option.previewDrive.syntheticDecisions.length === 2));
  });
});
