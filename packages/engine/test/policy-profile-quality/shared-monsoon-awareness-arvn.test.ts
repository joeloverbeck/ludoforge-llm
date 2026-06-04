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
      suppressedTemplateIds: ['arvn.sweepRaid'],
    });
  });
});
