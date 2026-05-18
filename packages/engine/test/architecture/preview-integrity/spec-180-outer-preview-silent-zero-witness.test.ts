// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  STANDING_PREVIEW_TERM_ID,
  runStandingPreviewTrace,
} from '../preview-standing/standing-preview-fixture.js';

describe('Spec 180 outer-preview silent-zero witness', () => {
  it('keeps all-unavailable seatAgg(sum) status-bearing instead of contributing numeric zero', () => {
    const trace = runStandingPreviewTrace({ previewVisibility: 'hidden', primeUnknownPreviewRef: true });

    assert.equal(trace.previewUsage.refIds.includes('victoryCurrentMargin.currentMargin.$seat'), true);
    for (const candidate of trace.candidates ?? []) {
      assert.equal(
        candidate.scoreContributions.some((entry) => entry.termId === STANDING_PREVIEW_TERM_ID),
        false,
      );
      assert.equal(candidate.score, 0);
      assert.deepEqual(candidate.previewFallbackFired, {
        termId: STANDING_PREVIEW_TERM_ID,
        kind: 'noContribution',
      });
      assert.equal(candidate.unknownPreviewRefs.length > 0, true);
    }

    assert.equal(trace.previewUsage.readyRefStats['victoryCurrentMargin.currentMargin.$seat']?.readyCount, 0);
  });
});
