// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlExecutedOutcomeCase, withEveryZoneSupportMarker } from './shared-competence-helpers.js';

describe('VC shared.blockCurrentLeader witness', () => {
  it('executes a denial that reduces the current leader margin', () => {
    assertFitlExecutedOutcomeCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'vc-baseline',
      seatId: 'vc',
      playerIndex: 3,
      seed: 210_001,
      expectedRootStableMoveKey: 'terror|{}|false|operation',
      leaderMarginAssertion: {
        label: 'US leader margin',
        query: { kind: 'terminalVictoryMargin', seat: 'us' },
        delta: { direction: 'decrease' },
      },
      prepareState: (def, state) => withEveryZoneSupportMarker(def, state, 'activeSupport'),
    });
  });
});
