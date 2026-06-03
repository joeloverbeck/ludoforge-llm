// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertFitlImmediateWinCase,
  moveAvailableUsIrregularsToCasualties,
  moveFactionBoardTokensToZone,
  moveOneToken,
  withEveryZoneSupportMarker,
} from './shared-competence-helpers.js';
import type { GameDef, GameState } from '../../src/kernel/index.js';

describe('US shared.immediateWin witness', () => {
  it('selects a non-pass root while the US self-margin is already winning', () => {
    assertFitlImmediateWinCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'us-baseline',
      seatId: 'us',
      playerIndex: 0,
      seed: 1,
      expectedRootStableMoveKey: 'event|{"eventCardId":"card-26","eventDeckId":"fitl-events-initial-card-pack","side":"shaded"}|false|event',
      selfMarginAssertion: {
        label: 'US self margin',
        query: { kind: 'terminalVictoryMargin', seat: 'us' },
        before: 52,
        after: 52,
        delta: { exact: 0 },
      },
      prepareState: prepareImmediateWinState,
    });
  });
});

function prepareImmediateWinState(def: GameDef, state: GameState): GameState {
  const support = withEveryZoneSupportMarker(def, state, 'activeSupport');
  const withoutMapUs = moveFactionBoardTokensToZone(def, support, 'US', 'available-US:none');
  const withTroop = moveOneToken(withoutMapUs, 'available-US:none', 'saigon:none', (token) =>
    token.props.faction === 'US' && token.props.type === 'troops');
  const withBase = moveOneToken(withTroop, 'available-US:none', 'saigon:none', (token) =>
    token.props.faction === 'US' && token.props.type === 'base');
  return moveAvailableUsIrregularsToCasualties(withBase);
}
