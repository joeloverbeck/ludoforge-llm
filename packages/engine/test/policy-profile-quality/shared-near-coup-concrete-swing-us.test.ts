// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertFitlNearCoupCase,
  moveAvailableUsIrregularsToCasualties,
  moveFactionBoardTokensToZone,
  moveOneToken,
  withEveryZoneSupportMarker,
} from './shared-competence-helpers.js';
import type { GameDef, GameState } from '../../src/kernel/index.js';

describe('US shared.nearCoupConcreteSwing witness', () => {
  it('executes a near-Coup concrete margin swing over pass', () => {
    assertFitlNearCoupCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'us-baseline',
      seatId: 'us',
      playerIndex: 0,
      seed: 1,
      expectedRootStableMoveKey: 'train|{}|false|operation',
      outcomeAssertions: [
        {
          label: 'VC Coup margin',
          query: { kind: 'terminalVictoryMargin', seat: 'vc' },
          before: 42,
          after: 36,
          delta: { exact: -6 },
        },
      ],
      prepareState: prepareSingleSpacePacify,
    });
  });
});

function prepareSingleSpacePacify(def: GameDef, state: GameState): GameState {
  const opposition = withEveryZoneSupportMarker(def, state, 'activeOpposition');
  const withoutMapUs = moveFactionBoardTokensToZone(def, opposition, 'US', 'available-US:none');
  const withTroop = moveOneToken(withoutMapUs, 'available-US:none', 'saigon:none', (token) =>
    token.props.faction === 'US' && token.props.type === 'troops');
  const withBase = moveOneToken(withTroop, 'available-US:none', 'saigon:none', (token) =>
    token.props.faction === 'US' && token.props.type === 'base');
  return moveAvailableUsIrregularsToCasualties(withBase);
}
