// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlMonsoonPairCase } from './shared-competence-helpers.js';

describe('NVA shared monsoon-awareness witness', () => {
  it('selects March control when clear and a competent fallback under Monsoon', () => {
    assertFitlMonsoonPairCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'nva-baseline',
      seatId: 'nva',
      playerIndex: 2,
      seed: 1,
      clearRootStableMoveKey: 'march|{}|noCompound|false|operation',
      clearTemplateId: 'nva.marchControl',
      monsoonRootStableMoveKey: 'rally|{}|noCompound|false|operation',
      monsoonTemplateId: 'nva.rallyTrail',
      suppressedTemplateIds: [
        'nva.locOccupationBeforeCoup',
        'nva.marchAmbush',
        'nva.marchControl',
        'nva.marchInfiltrate',
        'nva.marchInfiltrateControl',
      ],
      monsoonOutcomeAssertions: [
        {
          label: 'Trail improved by fallback Rally',
          query: { kind: 'globalVar', name: 'trail' },
          delta: { exact: 1 },
        },
      ],
    });
  });
});
