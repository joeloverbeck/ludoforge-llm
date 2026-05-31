// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitNvaPolicyQualityRecord, loadNvaPlanFixture } from './nva-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 203_005_08;

describe('Spec 203 NVA low-yield VC-steal guardrail witness', () => {
  it('demotes Infiltrate on VC assets when NVA gain and VC denial are unavailable', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const guardrails = fixture.profile.use.guardrails ?? [];
    const guardrail = fixture.def.agents?.library.guardrails?.['nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial'];

    const bound = guardrails.includes('nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial');
    const demotesStrongly = guardrail?.severity === 'demote';
    const usesGainAndDenial = guardrail?.dependencies.candidateFeatures.includes('projectedSelfMarginDelta') === true
      && guardrail.dependencies.strategicConditions?.includes('vcNearWin') === true;
    const passed = bound && demotesStrongly && usesGainAndDenial;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      decisions: guardrails.length,
    });

    assert.ok(bound, 'expected VC-steal guardrail bound');
    assert.ok(demotesStrongly, 'expected demote severity');
    assert.ok(usesGainAndDenial, 'expected guardrail to depend on projectedSelfMarginDelta and vcNearWin');
  });
});
