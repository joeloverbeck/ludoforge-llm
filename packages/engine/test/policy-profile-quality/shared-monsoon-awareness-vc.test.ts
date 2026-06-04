// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlMonsoonPairCase } from './shared-competence-helpers.js';

describe('VC shared monsoon-awareness witness', () => {
  it('selects March spread when clear and a competent fallback under Monsoon', () => {
    assertFitlMonsoonPairCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'vc-baseline',
      seatId: 'vc',
      playerIndex: 3,
      seed: 1,
      suppressedTemplateIds: ['vc.marchAmbushFromLoc', 'vc.marchSpread', 'vc.marchSubvert'],
    });
  });
});
