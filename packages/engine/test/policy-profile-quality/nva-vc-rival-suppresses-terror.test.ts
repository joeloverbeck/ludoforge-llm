// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitNvaPolicyQualityRecord, loadNvaPlanFixture } from './nva-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 203_005_04;

describe('Spec 203 NVA VC-rival Terror suppression witness', () => {
  it('suppresses Terror support reduction when VC near-win risk is active', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const module = fixture.def.agents?.library.strategyModules?.['nva.vcRivalRisk'];
    const templates = fixture.profile.plan.planTemplates ?? [];

    const hasModule = fixture.profile.use.strategyModules?.includes('nva.vcRivalRisk') === true;
    const suppressesTerror = module?.suppressesPlanTemplates.some((id) => id === 'nva.terrorSupportReduction') === true;
    const usesVcNearWin = module?.dependencies.strategicConditions?.includes('vcNearWin') === true;
    const keepsAttackAmbush = templates.includes('nva.attackAmbush');
    const passed = hasModule && suppressesTerror && usesVcNearWin && keepsAttackAmbush;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      decisions: module?.suppressesPlanTemplates.length ?? 0,
    });

    assert.ok(hasModule, 'expected nva.vcRivalRisk bound');
    assert.ok(suppressesTerror, 'expected nva.vcRivalRisk to suppress nva.terrorSupportReduction');
    assert.ok(usesVcNearWin, 'expected nva.vcRivalRisk to depend on vcNearWin');
    assert.ok(keepsAttackAmbush, 'expected nva.attackAmbush to remain bound for denial pressure');
  });
});
