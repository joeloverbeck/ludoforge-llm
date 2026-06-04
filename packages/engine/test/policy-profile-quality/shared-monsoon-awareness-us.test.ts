// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertFitlMonsoonPairCase,
  moveFactionBoardTokensToZone,
  moveOneToken,
  withEveryZoneSupportMarker,
} from './shared-competence-helpers.js';
import type { GameDef, GameState } from '../../src/kernel/index.js';

describe('US shared monsoon-awareness witness', () => {
  it('selects Sweep/Air Strike when clear and a competent fallback under Monsoon', () => {
    assertFitlMonsoonPairCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'us-baseline',
      seatId: 'us',
      playerIndex: 0,
      seed: 1,
      clearRootStableMoveKey: 'sweep|{}|false|operation',
      clearTemplateId: 'us.sweepAirStrike',
      monsoonRootStableMoveKey: 'train|{}|false|operation',
      monsoonTemplateId: 'us.trainAdvise',
      suppressedTemplateIds: ['us.sweepAirStrike'],
      prepareState: prepareInsurgentExposureState,
      monsoonOutcomeAssertions: [
        {
          label: 'ARVN resources spent by fallback Train',
          query: { kind: 'globalVar', name: 'arvnResources' },
          delta: { exact: -3 },
        },
      ],
    });
  });
});

function prepareInsurgentExposureState(def: GameDef, state: GameState): GameState {
  const opposition = withEveryZoneSupportMarker(def, state, 'activeOpposition');
  const withoutMapUs = moveFactionBoardTokensToZone(def, opposition, 'US', 'available-US:none');
  const withTroop = moveOneToken(withoutMapUs, 'available-US:none', 'saigon:none', (token) =>
    token.props.faction === 'US' && token.props.type === 'troops');
  const withBase = moveOneToken(withTroop, 'available-US:none', 'saigon:none', (token) =>
    token.props.faction === 'US' && token.props.type === 'base');
  const withNvaGuerrilla = moveOneToken(withBase, 'available-NVA:none', 'saigon:none', (token) =>
    token.props.faction === 'NVA' && token.props.type === 'guerrilla');
  const withVcGuerrilla = moveOneToken(withNvaGuerrilla, 'available-VC:none', 'saigon:none', (token) =>
    token.props.faction === 'VC' && token.props.type === 'guerrilla');
  return {
    ...withVcGuerrilla,
    globalVars: {
      ...withVcGuerrilla.globalVars,
      airStrikeRemaining: 1,
    },
  };
}
