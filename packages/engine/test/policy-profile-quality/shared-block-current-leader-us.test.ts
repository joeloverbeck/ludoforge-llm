// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertFitlExecutedOutcomeCase,
  moveAvailableUsIrregularsToCasualties,
  moveFactionBoardTokensToZone,
  moveOneToken,
  withEveryZoneSupportMarker,
} from './shared-competence-helpers.js';
import type { GameDef, GameState } from '../../src/kernel/index.js';

describe('US shared.blockCurrentLeader witness', () => {
  it('executes a denial that reduces the current leader margin', () => {
    assertFitlExecutedOutcomeCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'us-baseline',
      seatId: 'us',
      playerIndex: 0,
      seed: 1,
      expectedRootStableMoveKey: 'train|{}|noCompound|false|operation',
      leaderMarginAssertion: {
        label: 'VC leader margin',
        query: { kind: 'terminalVictoryMargin', seat: 'vc' },
        delta: { direction: 'decrease' },
      },
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
