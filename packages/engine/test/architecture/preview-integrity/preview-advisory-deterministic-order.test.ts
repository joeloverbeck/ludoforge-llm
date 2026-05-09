// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runPreviewIntegrityPolicyTrace } from './preview-integrity-fixture.js';

describe('preview signal unavailable advisory', () => {
  it('emits one deterministic no-signal advisory and selected-candidate reason', () => {
    const firstTrace = runPreviewIntegrityPolicyTrace(false);
    const secondTrace = runPreviewIntegrityPolicyTrace(false);

    assert.deepEqual(firstTrace.advisories, secondTrace.advisories);
    assert.equal(JSON.stringify(firstTrace), JSON.stringify(secondTrace));
    assert.equal(firstTrace.advisories?.length, 1);
    assert.deepEqual(firstTrace.advisories?.[0], {
      code: 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE',
      profileId: 'baseline',
      seatId: 'us',
      decisionKind: 'chooseNStep',
      decisionKey: '$picks',
      requestedRefs: ['preview.option.delta.victory.currentMargin.self'],
      evaluatedRootOptionCount: 3,
      unavailableRootOptionCount: 3,
      unavailabilityBreakdown: {
        random: 0,
        hidden: 3,
        unresolved: 0,
        failed: 0,
        depthCap: 0,
        noPreviewDecision: 0,
        gated: 0,
      },
      selectedStableMoveKey: firstTrace.selectedStableMoveKey,
      selectionReason: 'tiebreakAfterPreviewNoSignal',
    });

    const selected = firstTrace.candidates?.find((candidate) => candidate.stableMoveKey === firstTrace.selectedStableMoveKey);
    assert.equal(selected?.selectionReason, 'tiebreakAfterPreviewNoSignal');
    assert.deepEqual(selected?.unknownPreviewRefs, [
      { refId: 'preview.option.delta.victory.currentMargin.self', reason: 'hidden' },
    ]);
  });
});
