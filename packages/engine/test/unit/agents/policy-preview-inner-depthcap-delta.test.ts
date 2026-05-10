// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runChooseNStepInnerPreview } from '../../../src/agents/policy-preview-inner-choosenstep.js';
import { asPlayerId } from '../../../src/kernel/index.js';
import {
  createChoosenStepPreviewFixture,
  previewDeltaRef,
} from './policy-preview-inner-choosenstep-fixture.js';

describe('depth-capped preview delta refs', () => {
  it('reports delta margin refs as unavailable instead of ready partial-state values', () => {
    const { catalog, def, state, microturn } = createChoosenStepPreviewFixture(true);
    const profile = catalog.profiles.baseline!;

    const run = runChooseNStepInnerPreview({
      def,
      state,
      microturn,
      playerId: asPlayerId(0),
      seatId: 'us',
      catalog,
      profile: {
        ...profile,
        preview: {
          ...profile.preview,
          inner: {
            chooseOne: profile.preview.inner?.chooseOne ?? false,
            chooseNStep: true,
            maxOptions: profile.preview.inner?.maxOptions ?? 4,
            chooseNBeamWidth: profile.preview.inner?.chooseNBeamWidth ?? 1,
            depthCap: 0,
            strategy: 'singlePass',
            capClass: 'standard256',
          },
        },
      },
      refs: [previewDeltaRef],
    });

    assert.equal(run.outcomeBreakdown.unknownDepthCap, run.options.length);
    for (const option of run.options) {
      assert.deepEqual(option.resolvedRefs.get('preview.option.delta.victory.currentMargin.self'), {
        kind: 'unavailable',
        reason: 'depthCap',
      });
    }
  });
});
