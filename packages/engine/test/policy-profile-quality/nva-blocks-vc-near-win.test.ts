// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitNvaPolicyQualityRecord, loadNvaPlanFixture } from './nva-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 203_005_07;

describe('Spec 203 NVA blocks VC near-win witness', () => {
  it('encodes VC-denial scoring and VC-kingmaking avoidance for near-win states', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const module = lib?.strategyModules?.['nva.vcRivalRisk'];
    const posture = lib?.postureEvaluators?.['nva.avoidVcKingmaking'];
    const selector = lib?.selectors?.['nva.infiltrateVcTargetRational'];

    const moduleUsesVcMargin = module?.dependencies.candidateFeatures.includes('projectedVcMarginDelta') === true;
    const postureUsesVcNearWin = posture?.dependencies.strategicConditions?.includes('vcNearWin') === true;
    const selectorUsesVcNearWin = selector?.dependencies.strategicConditions?.includes('vcNearWin') === true;
    const passed = moduleUsesVcMargin && postureUsesVcNearWin && selectorUsesVcNearWin;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      decisions: fixture.profile.use.strategyModules?.length ?? 0,
    });

    assert.ok(moduleUsesVcMargin, 'expected nva.vcRivalRisk to score projectedVcMarginDelta');
    assert.ok(postureUsesVcNearWin, 'expected nva.avoidVcKingmaking to depend on vcNearWin');
    assert.ok(selectorUsesVcNearWin, 'expected rational VC Infiltrate selector to depend on vcNearWin');
  });
});
