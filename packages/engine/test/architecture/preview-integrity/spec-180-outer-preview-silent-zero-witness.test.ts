// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  STANDING_PREVIEW_TERM_ID,
  runStandingPreviewTrace,
} from '../preview-standing/standing-preview-fixture.js';

describe('Spec 180 outer-preview silent-zero witness', () => {
  it('pins current seatAgg(sum) behavior where unavailable opponent preview cells contribute numeric zero', () => {
    const trace = runStandingPreviewTrace({ previewVisibility: 'hidden' });

    assert.equal(trace.previewUsage.refIds.includes('victoryCurrentMargin.currentMargin.$seat'), true);
    for (const candidate of trace.candidates ?? []) {
      assert.deepEqual(
        candidate.scoreContributions.find((entry) => entry.termId === STANDING_PREVIEW_TERM_ID),
        { termId: STANDING_PREVIEW_TERM_ID, contribution: 0 },
      );
      assert.equal(candidate.score, 0);
      assert.equal(candidate.previewFallbackFired, undefined);
    }

    assert.equal(trace.previewUsage.readyRefStats['victoryCurrentMargin.currentMargin.$seat']?.readyCount, 0);
  });
});
