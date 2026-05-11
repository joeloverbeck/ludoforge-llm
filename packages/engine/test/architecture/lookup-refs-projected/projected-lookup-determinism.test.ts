// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  readyProjectedState,
  scoreProjectedOption,
  zonePopulationRef,
} from './projected-lookup-runtime-test-helpers.js';

const serializeResult = (result: ReturnType<typeof scoreProjectedOption>): string => JSON.stringify({
  score: result.score,
  contributions: result.scoreContributions,
  unknownPreviewRefs: [...result.unknownPreviewRefs.entries()],
  unknownLookupRefs: [...result.unknownLookupRefs.entries()],
  previewFallbackFired: result.previewFallbackFired ?? null,
  lookupFallbackFired: result.lookupFallbackFired ?? null,
});

describe('projected lookup determinism', () => {
  it('resolves byte-identical values and sorted unknown maps across replays', () => {
    const first = scoreProjectedOption([zonePopulationRef], 'public-zone:none', readyProjectedState);
    const second = scoreProjectedOption([zonePopulationRef], 'public-zone:none', readyProjectedState);

    assert.equal(serializeResult(first), serializeResult(second));
  });
});
