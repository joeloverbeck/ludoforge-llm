// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  captureProjectedLookupDeepening,
  projectedLookupRefId,
} from './projected-lookup-deepening-fixture.js';

describe('projected lookup continued deepening depth-cap trigger', () => {
  it('fires the deep pass when projected lookups are depth-capped in the broad pass', () => {
    const preview = captureProjectedLookupDeepening('allRequestedRefsDepthCapped', 2);
    const coverage = preview.usage.coverage;

    assert.deepEqual(preview.refIds, [projectedLookupRefId]);
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
    assert.equal(preview.usage.readyRefStats[projectedLookupRefId]?.readyCount, 3);
  });
});
