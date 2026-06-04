// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertFitlExecutedOutcomeCase,
  moveFactionBoardTokensToZone,
  moveOneToken,
  withEveryZoneSupportMarker,
} from './shared-competence-helpers.js';
import type { GameDef, GameState } from '../../src/kernel/index.js';

describe('NVA shared.blockCurrentLeader witness', () => {
  it('executes a denial that reduces the current leader margin', () => {
    assertFitlExecutedOutcomeCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'nva-baseline',
      seatId: 'nva',
      playerIndex: 2,
      seed: 210_001,
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
