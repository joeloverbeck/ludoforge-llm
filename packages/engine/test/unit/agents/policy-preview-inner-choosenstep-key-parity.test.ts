// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/index.js';
import { runChooseNStepInnerPreview } from '../../../src/agents/policy-preview-inner-choosenstep.js';
import { asPlayerId } from '../../../src/kernel/index.js';
import {
  createChoosenStepPreviewFixture,
  legalAddStableKeys,
  previewDeltaRef,
} from './policy-preview-inner-choosenstep-fixture.js';

describe('chooseNStep inner-preview key parity', () => {
  it('keeps preview option keys, frontier keys, and chooseN contribution keys byte-identical for ADDs', () => {
    const fixture = createChoosenStepPreviewFixture(true);
    const profile = fixture.catalog.profiles.baseline!;
    const expectedAddKeys = legalAddStableKeys(fixture.microturn);
    const previewRun = runChooseNStepInnerPreview({
      def: fixture.def,
      state: fixture.state,
      microturn: fixture.microturn,
      playerId: asPlayerId(0),
      seatId: 'us',
      catalog: fixture.catalog,
      profile,
      refs: [previewDeltaRef],
    });

    assert.deepEqual(previewRun.options.map((option) => option.stableMoveKey), expectedAddKeys);

    const agent = new PolicyAgent({ traceLevel: 'verbose' });
    const result = agent.chooseDecision(fixture.input);
    const addCandidates = (result.agentDecision?.candidates ?? [])
      .filter((candidate) => expectedAddKeys.includes(candidate.stableMoveKey))
      .sort((left, right) => left.stableMoveKey.localeCompare(right.stableMoveKey));

    assert.deepEqual(addCandidates.map((candidate) => candidate.stableMoveKey), expectedAddKeys);
    assert.deepEqual(
      addCandidates.map((candidate) => [
        candidate.stableMoveKey,
        candidate.previewRefIds,
        candidate.scoreContributions,
      ]),
      [
        [
          'chooseNStep:$picks:add:"high"',
          ['preview.option.delta.victory.currentMargin.self'],
          [{ termId: 'preferProjectedMargin', contribution: 5 }],
        ],
        [
          'chooseNStep:$picks:add:"low"',
          ['preview.option.delta.victory.currentMargin.self'],
          [{ termId: 'preferProjectedMargin', contribution: 1 }],
        ],
        [
          'chooseNStep:$picks:add:"spare"',
          ['preview.option.delta.victory.currentMargin.self'],
          [{ termId: 'preferProjectedMargin', contribution: 1 }],
        ],
      ],
    );
  });
});
