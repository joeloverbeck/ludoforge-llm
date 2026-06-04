// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlNearCoupCase, withEveryZoneSupportMarker } from './shared-competence-helpers.js';

describe('VC shared.nearCoupConcreteSwing witness', () => {
  it('executes a near-Coup concrete margin swing over pass', () => {
    assertFitlNearCoupCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'vc-baseline',
      seatId: 'vc',
      playerIndex: 3,
      seed: 210_001,
      expectedRootStableMoveKey: 'terror|{}|noCompound|false|operation',
      outcomeAssertions: [
        {
          label: 'VC Coup margin',
          query: { kind: 'terminalVictoryMargin', seat: 'vc' },
          before: 7,
          after: 9,
          delta: { exact: 2 },
        },
        {
          label: 'VC Opposition total',
          query: { kind: 'stateFeature', id: 'totalOpposition', seatId: 'vc', playerId: 3 },
          before: 35,
          after: 37,
          delta: { exact: 2 },
        },
      ],
      prepareState: (def, state) => withEveryZoneSupportMarker(def, state, 'passiveOpposition'),
    });
  });
});
