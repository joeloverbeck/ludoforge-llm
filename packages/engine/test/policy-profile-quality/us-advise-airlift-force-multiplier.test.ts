// @test-class: convergence-witness
// @profile-variant: us-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  loadUsPlanFixture,
  proposeUsPlan,
  requireAlternative,
} from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_008_02;

describe('Spec 188 US Advise force-multiplier witness', () => {
  it('binds the valid Advise skeleton template to force-multiplier role selectors', () => {
    const fixture = loadUsPlanFixture(SEED);
    const profile = fixture.def.agents?.profiles['us-baseline'];
    const trainAdviseTemplate = fixture.def.agents?.library.planTemplates?.['us.trainAdvise'];
    const trainResult = proposeUsPlan(fixture, ['train']);
    const trainAdvise = requireAlternative(trainResult, 'us.trainAdvise');
    const passed = (profile?.plan.strategyModules ?? []).includes('us.forceMultiplier')
      && (profile?.plan.planTemplates ?? []).includes('us.trainAdvise')
      && !(profile?.plan.planTemplates ?? []).includes('us.airLiftTrain')
      && trainAdviseTemplate?.roles.adviseSpace?.selectorId === 'us.adviseTargetSpace'
      && trainAdvise.roleBindings.adviseSpace?.components.indigenousForceMultiplier === 1;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: trainResult.status,
      decisions: trainResult.alternatives.length,
    });

    assert.equal((profile?.plan.strategyModules ?? []).includes('us.forceMultiplier'), true);
    assert.equal((profile?.plan.planTemplates ?? []).includes('us.trainAdvise'), true);
    assert.equal((profile?.plan.planTemplates ?? []).includes('us.airLiftTrain'), false);
    assert.equal(trainAdviseTemplate?.roles.adviseSpace?.selectorId, 'us.adviseTargetSpace');
    assert.equal(trainAdvise.roleBindings.adviseSpace?.components.indigenousForceMultiplier, 1);
  });
});
