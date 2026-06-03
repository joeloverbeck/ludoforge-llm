// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlNearCoupCase, withEveryZoneSupportMarker } from './shared-competence-helpers.js';

describe('ARVN shared.nearCoupConcreteSwing witness', () => {
  it('executes a near-Coup concrete margin swing over pass', () => {
    assertFitlNearCoupCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'arvn-baseline',
      seatId: 'arvn',
      playerIndex: 1,
      seed: 210_001,
      expectedRootStableMoveKey: 'govern|{}|false|specialActivity',
      outcomeAssertions: [
        {
          label: 'US Coup margin',
          query: { kind: 'terminalVictoryMargin', seat: 'us' },
          before: 43,
          after: 42,
          delta: { exact: -1 },
        },
      ],
      prepareState: (def, state) => withEveryZoneSupportMarker(def, state, 'activeSupport'),
    });
  });
});
