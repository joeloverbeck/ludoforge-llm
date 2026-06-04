// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlExecutedOutcomeCase, withEveryZoneSupportMarker } from './shared-competence-helpers.js';

describe('ARVN shared.blockCurrentLeader witness', () => {
  it('executes a denial that reduces the current leader margin', () => {
    assertFitlExecutedOutcomeCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'arvn-baseline',
      seatId: 'arvn',
      playerIndex: 1,
      seed: 210_001,
      expectedRootStableMoveKey: 'govern|{}|noCompound|false|specialActivity',
      leaderMarginAssertion: {
        label: 'US leader margin',
        query: { kind: 'terminalVictoryMargin', seat: 'us' },
        delta: { direction: 'decrease' },
      },
      prepareState: (def, state) => withEveryZoneSupportMarker(def, state, 'activeSupport'),
    });
  });
});
