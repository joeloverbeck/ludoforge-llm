// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertFitlNearCoupCase,
  moveFactionBoardTokensToZone,
  moveOneToken,
  withEveryZoneSupportMarker,
} from './shared-competence-helpers.js';
import type { GameDef, GameState } from '../../src/kernel/index.js';

describe('NVA shared.nearCoupConcreteSwing witness', () => {
  it('executes a near-Coup concrete margin swing over pass', () => {
    assertFitlNearCoupCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'nva-baseline',
      seatId: 'nva',
      playerIndex: 2,
      seed: 210_001,
      expectedRootStableMoveKey: 'terror|{}|false|operation',
      outcomeAssertions: [
        {
          label: 'US Coup margin',
          query: { kind: 'terminalVictoryMargin', seat: 'us' },
          before: 43,
          after: 37,
          delta: { exact: -6 },
        },
      ],
      prepareState: prepareSingleSpaceTerror,
    });
  });
});

function prepareSingleSpaceTerror(def: GameDef, state: GameState): GameState {
  const support = withEveryZoneSupportMarker(def, state, 'activeSupport');
  const withoutMapNva = moveFactionBoardTokensToZone(def, support, 'NVA', 'available-NVA:none');
  return moveOneToken(withoutMapNva, 'available-NVA:none', 'saigon:none', (token) =>
    token.props.faction === 'NVA' && token.props.type === 'guerrilla');
}
