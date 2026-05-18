// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  STANDING_PREVIEW_TERM_ID,
  candidateByActionId,
  runStandingPreviewTrace,
} from './standing-preview-fixture.js';

describe('Spec 180 ordinary-operation standing projection witness', () => {
  it('expects value-bearing ordinary operations to differentiate opponent standing while unavailable projections stay status-bearing', () => {
    const trace = runStandingPreviewTrace({ previewVisibility: 'public', completionDepthCap: 1 });

    const hold = candidateByActionId(trace, 'hold-standing');
    const harmEast = candidateByActionId(trace, 'harm-east-standing');

    assert.deepEqual(
      harmEast.scoreContributions.find((entry) => entry.termId === STANDING_PREVIEW_TERM_ID),
      { termId: STANDING_PREVIEW_TERM_ID, contribution: 5 },
    );
    assert.equal(harmEast.previewOutcome, 'ready');
    assert.equal(harmEast.unknownPreviewRefs.length, 0);
    assert.equal(harmEast.score > hold.score, true);

    const hiddenTrace = runStandingPreviewTrace({ previewVisibility: 'hidden', completionDepthCap: 1 });
    const hiddenHarmEast = candidateByActionId(hiddenTrace, 'harm-east-standing');

    assert.deepEqual(
      hiddenHarmEast.unknownPreviewRefs,
      [{ refId: 'victoryCurrentMargin.currentMargin.$seat', reason: 'hidden' }],
    );
    assert.equal(
      hiddenHarmEast.scoreContributions.some((entry) => entry.termId === STANDING_PREVIEW_TERM_ID),
      false,
      'unavailable opponent standing must remain status-bearing unavailable evidence, not a numeric zero contribution',
    );
  });
});
