// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlAllyRivalLiveCase } from './ally-rival-competence-helpers.js';
import {
  moveFactionBoardTokensToZone,
  moveOneToken,
  withEveryZoneSupportMarker,
} from './shared-competence-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 210_005_04;

describe('VC shared.allyRivalThrottle witness', () => {
  it('keeps VC base-network Rally available while NVA is far from victory', () => {
    assertFitlAllyRivalLiveCase({
      testFile: TEST_FILE,
      profileId: 'vc-baseline',
      seatId: 'vc',
      playerIndex: 3,
      seed: SEED,
      prepareState: (_def, state) => state,
      inactiveDoctrines: ['vc.nvaRivalRisk', 'shared.allyRivalThrottle'],
    });
  });

  it('suppresses NVA-helping base-network Rally when NVA is near victory', () => {
    assertFitlAllyRivalLiveCase({
      testFile: TEST_FILE,
      profileId: 'vc-baseline',
      seatId: 'vc',
      playerIndex: 3,
      seed: SEED,
      prepareState: withNvaNearWinAndUsSupportLead,
      activeDoctrines: ['shared.allyRivalThrottle', 'vc.nvaRivalRisk'],
      outcomeAssertions: [
        {
          label: 'Terror reduces active Support',
          query: { kind: 'markerCount', markerId: 'supportOpposition', markerState: 'activeSupport' },
          delta: { exact: -1 },
        },
      ],
    });
  });
});

function withNvaNearWinAndUsSupportLead(def: Parameters<typeof withEveryZoneSupportMarker>[0], state: Parameters<typeof withEveryZoneSupportMarker>[1]) {
  let prepared = withEveryZoneSupportMarker(def, state, 'activeSupport');
  prepared = moveFactionBoardTokensToZone(def, prepared, 'US', 'available-US:none');
  prepared = moveFactionBoardTokensToZone(def, prepared, 'ARVN', 'available-ARVN:none');
  for (const zoneId of [
    'saigon:none',
    'hue:none',
    'quang-tri-thua-thien:none',
    'quang-tin-quang-ngai:none',
    'binh-dinh:none',
    'tay-ninh:none',
    'kien-phong:none',
    'kien-hoa-vinh-binh:none',
  ]) {
    prepared = moveOneToken(prepared, 'available-NVA:none', zoneId, (token) =>
      token.props.faction === 'NVA' && token.props.type === 'troops');
  }
  for (const zoneId of ['saigon:none', 'hue:none', 'quang-tri-thua-thien:none']) {
    prepared = moveOneToken(prepared, 'available-NVA:none', zoneId, (token) =>
      token.props.faction === 'NVA' && token.props.type === 'base');
  }
  return prepared;
}
