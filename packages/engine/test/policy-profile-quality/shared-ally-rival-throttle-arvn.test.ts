// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlAllyRivalLiveCase } from './ally-rival-competence-helpers.js';
import { withEveryZoneSupportMarker } from './shared-competence-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 210_005_02;

describe('ARVN shared.allyRivalThrottle witness', () => {
  it('runs the ordinary ARVN sweep path while US is far from victory', () => {
    assertFitlAllyRivalLiveCase({
      testFile: TEST_FILE,
      profileId: 'arvn-baseline',
      seatId: 'arvn',
      playerIndex: 1,
      seed: SEED,
      prepareState: (_def, state) => state,
      expectedRootStableMoveKey: 'sweep|{}|false|operation',
      expectedTemplateId: 'arvn.sweepRaid',
      inactiveDoctrines: ['shared.allyRivalThrottle', 'shared.blockCurrentLeader'],
      unfilteredTemplates: ['arvn.trainGovern', 'arvn.patrolGovern'],
    });
  });

  it('executes ARVN Govern denial when US is near victory', () => {
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
      filteredTemplates: [
        { templateId: 'arvn.trainGovern', gatedBy: ['shared.blockCurrentLeader'], reason: 'notEnabled' },
        { templateId: 'arvn.patrolGovern', gatedBy: ['shared.blockCurrentLeader'], reason: 'notEnabled' },
      ],
      outcomeAssertions: [
        {
          label: 'US margin reduced by Govern denial',
          query: { kind: 'victoryStandingMargin', seat: 'us' },
          delta: { exact: -1 },
        },
        {
          label: 'ARVN patronage increases',
          query: { kind: 'globalVar', name: 'patronage' },
          delta: { exact: 1 },
        },
      ],
    });
  });
});
