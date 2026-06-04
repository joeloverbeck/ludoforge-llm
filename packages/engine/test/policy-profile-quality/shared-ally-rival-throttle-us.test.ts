// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlAllyRivalLiveCase } from './ally-rival-competence-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 210_005_01;

describe('US shared.allyRivalThrottle witness', () => {
  it('keeps ARVN-helping templates eligible while ARVN is far from victory', () => {
    assertFitlAllyRivalLiveCase({
      testFile: TEST_FILE,
      profileId: 'us-baseline',
      seatId: 'us',
      playerIndex: 0,
      seed: SEED,
      prepareState: (_def, state) => state,
      inactiveDoctrines: ['us.avoidArvnKingmaking', 'shared.allyRivalThrottle'],
      unfilteredTemplates: ['us.trainPacify', 'us.patrolAdvise'],
    });
  });

  it('suppresses ARVN-helping templates when ARVN is near victory', () => {
    assertFitlAllyRivalLiveCase({
      testFile: TEST_FILE,
      profileId: 'us-baseline',
      seatId: 'us',
      playerIndex: 0,
      seed: SEED,
      prepareState: (_def, state) => ({
        ...state,
        globalVars: { ...state.globalVars, patronage: 29 },
      }),
      activeDoctrines: ['us.avoidArvnKingmaking'],
      filteredTemplates: [
        { templateId: 'us.trainPacify', gatedBy: ['us.avoidArvnKingmaking'], reason: 'suppressed' },
        { templateId: 'us.patrolAdvise', gatedBy: ['us.avoidArvnKingmaking'], reason: 'suppressed' },
      ],
    });
  });
});
