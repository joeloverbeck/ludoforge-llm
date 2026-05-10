// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { capturePreview } from './continued-deepening-fixture.js';

describe('continued deepening per-phase coverage rollup', () => {
  it('records broad and deep phase coverage while top-level coverage summarizes final refs', () => {
    const coverage = capturePreview('continuedDeepening').usage.coverage;

    assert.equal(coverage.strategy, 'continuedDeepening');
    assert.equal(coverage.capClass, 'deep1024');
    assert.deepEqual(coverage.broad, {
      evaluatedRootOptionCount: 3,
      readyRootOptionCount: 0,
      unavailableRootOptionCount: 3,
    });
    assert.deepEqual(coverage.deep, {
      evaluatedRootOptionCount: 3,
      readyRootOptionCount: 3,
      unavailableRootOptionCount: 0,
      triggerFired: 'allRequestedRefsDepthCapped',
    });
    assert.equal(coverage.readyRootOptionCount, 3);
    assert.equal(coverage.unavailableRootOptionCount, 0);
    assert.equal(coverage.allRootsUnavailable, false);
  });
});
