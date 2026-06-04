// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlAllyRivalLiveCase } from './ally-rival-competence-helpers.js';
import { withEveryZoneSupportMarker } from './shared-competence-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 210_005_03;

describe('Spec 203 NVA VC-rival Terror suppression witness', () => {
  it('suppresses Terror support reduction when VC near-win risk is active in the live frontier', () => {
    assertFitlAllyRivalLiveCase({
      testFile: TEST_FILE,
      profileId: 'nva-baseline',
      seatId: 'nva',
      playerIndex: 2,
      seed: SEED,
      prepareState: (def, state) => withEveryZoneSupportMarker(def, state, 'activeOpposition'),
      expectedRootStableMoveKey: 'march|{}|noCompound|false|operation',
      expectedTemplateId: 'nva.marchControl',
      activeDoctrines: ['nva.vcRivalRisk'],
      filteredTemplates: [
        { templateId: 'nva.terrorSupportReduction', gatedBy: ['nva.vcRivalRisk'], reason: 'suppressed' },
      ],
    });
  });
});
