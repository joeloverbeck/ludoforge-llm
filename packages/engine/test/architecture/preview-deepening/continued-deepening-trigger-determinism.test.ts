// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { capturePreview } from './continued-deepening-fixture.js';

const stablePreview = (): string => {
  const preview = capturePreview('continuedDeepening');
  return JSON.stringify({
    usage: preview.usage,
    options: preview.run.options.map((option) => ({
      stableMoveKey: option.stableMoveKey,
      outcome: option.outcome,
      driveDepth: option.driveDepth,
      refs: [...option.resolvedRefs.entries()].sort(([left], [right]) => left.localeCompare(right)),
      synthetic: option.previewDrive.syntheticDecisions,
    })),
  });
};

describe('continued deepening trigger determinism', () => {
  it('emits byte-identical merged previews across replays', () => {
    assert.equal(stablePreview(), stablePreview());
  });
});
