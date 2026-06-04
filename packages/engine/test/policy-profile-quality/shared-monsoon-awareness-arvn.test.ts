// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlMonsoonPairCase } from './shared-competence-helpers.js';

describe('ARVN shared monsoon-awareness witness', () => {
  it('selects Sweep/Raid when clear and a competent fallback under Monsoon', () => {
    assertFitlMonsoonPairCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'arvn-baseline',
      seatId: 'arvn',
      playerIndex: 1,
      seed: 1,
      clearRootStableMoveKey: 'sweep|{}|false|operation',
      clearTemplateId: 'arvn.sweepRaid',
      monsoonRootStableMoveKey: 'train|{}|false|operation',
      monsoonTemplateId: 'arvn.trainGovern',
      suppressedTemplateIds: ['arvn.sweepRaid'],
      clearOutcomeAssertions: [
        {
          label: 'ARVN resources spent by clear Sweep',
          query: { kind: 'globalVar', name: 'arvnResources' },
          delta: { exact: -6 },
        },
      ],
      monsoonOutcomeAssertions: [
        {
          label: 'Aid improved by fallback Train',
          query: { kind: 'globalVar', name: 'aid' },
          delta: { exact: 5 },
        },
      ],
    });
  });
});
