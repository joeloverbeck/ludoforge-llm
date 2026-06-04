// @test-class: convergence-witness
// @profile-variant: arvn-baseline
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlAllyRivalLiveCase } from './ally-rival-competence-helpers.js';
import { withEveryZoneSupportMarker } from './shared-competence-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 210_005_02;

describe('Spec 188 ARVN US rival-risk flip witness', () => {
  it('turns the nominal US ally into a negative posture term and executes Govern denial', () => {
    assertFitlAllyRivalLiveCase({
      testFile: TEST_FILE,
      profileId: 'arvn-baseline',
      seatId: 'arvn',
      playerIndex: 1,
      seed: SEED,
      prepareState: (def, state) => withEveryZoneSupportMarker(def, state, 'activeSupport'),
      expectedRootStableMoveKey: 'govern|{}|false|specialActivity',
      expectedTemplateId: 'arvn.governLeaderDenial',
      activeDoctrines: ['shared.allyRivalThrottle', 'arvn.denyUSIfNearWin'],
      postureContributions: [{ id: 'us-rival-risk', maxContribution: -1 }],
      allyFlips: [{ contributionId: 'us-rival-risk', seat: 'us', fired: true }],
      outcomeAssertions: [
        {
          label: 'US margin reduced by Govern denial',
          query: { kind: 'victoryStandingMargin', seat: 'us' },
          delta: { exact: -1 },
        },
        {
          label: 'ARVN margin improves through patronage',
          query: { kind: 'victoryStandingMargin', seat: 'arvn' },
          delta: { exact: 1 },
        },
      ],
    });
  });
});
