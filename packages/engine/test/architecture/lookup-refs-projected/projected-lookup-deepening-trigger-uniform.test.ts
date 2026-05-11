// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  captureProjectedLookupDeepening,
  projectedLookupRefId,
  runProjectedLookupTrace,
} from './projected-lookup-deepening-fixture.js';

describe('projected lookup continued deepening uniform-contribution trigger', () => {
  it('fires the deep pass when projected lookup contributions are uniform', () => {
    const preview = captureProjectedLookupDeepening('allReadyValuesUniform', 1);
    const coverage = preview.usage.coverage;

    assert.deepEqual(preview.refIds, [projectedLookupRefId]);
    assert.equal(coverage.strategy, 'continuedDeepening');
    assert.deepEqual(coverage.broad, {
      evaluatedRootOptionCount: 3,
      readyRootOptionCount: 3,
      unavailableRootOptionCount: 0,
    });
    assert.deepEqual(coverage.deep, {
      evaluatedRootOptionCount: 3,
      readyRootOptionCount: 3,
      unavailableRootOptionCount: 0,
      triggerFired: 'allReadyValuesUniform',
    });
    assert.equal(preview.usage.readyRefStats[projectedLookupRefId]?.distinctValueCount, 1);
    assert.equal(preview.usage.coverage.selectedByTieBreakerBecausePreviewUnavailable, true);
  });

  it('records tiebreakAfterPreviewNoSignal when projected lookup contributions stay uniform', () => {
    const trace = runProjectedLookupTrace('allReadyValuesUniform', 1);
    const selected = trace.candidates?.find((candidate) => candidate.stableMoveKey === trace.selectedStableMoveKey);

    assert.equal(selected?.selectionReason, 'tiebreakAfterPreviewNoSignal');
    assert.equal(trace.previewUsage.readyRefStats[projectedLookupRefId]?.allReadyValuesEqual, true);
  });
});
