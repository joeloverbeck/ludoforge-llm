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

describe('Spec 188 US Advise/Air Lift force-multiplier witness', () => {
  it('binds Advise and Air Lift skeleton templates to force-multiplier role selectors', () => {
    const fixture = loadUsPlanFixture(SEED);
    const profile = fixture.def.agents?.profiles['us-baseline'];
    const trainAdviseTemplate = fixture.def.agents?.library.planTemplates?.['us.trainAdvise'];
    const airLiftTrainTemplate = fixture.def.agents?.library.planTemplates?.['us.airLiftTrain'];
    const trainResult = proposeUsPlan(fixture, ['train']);
    const airLiftResult = proposeUsPlan(fixture, ['airLift']);
    const trainAdvise = requireAlternative(trainResult, 'us.trainAdvise');
    const airLiftTrain = requireAlternative(airLiftResult, 'us.airLiftTrain');
    const passed = (profile?.plan.strategyModules ?? []).includes('us.forceMultiplier')
      && (profile?.plan.planTemplates ?? []).includes('us.trainAdvise')
      && (profile?.plan.planTemplates ?? []).includes('us.airLiftTrain')
      && trainAdviseTemplate?.roles.adviseSpace?.selectorId === 'us.adviseTargetSpace'
      && airLiftTrainTemplate?.roles.airLiftRoute?.selectorId === 'us.airLiftDestination'
      && trainAdvise.roleBindings.adviseSpace?.components.indigenousForceMultiplier === 1
      && airLiftTrain.roleBindings.airLiftRoute?.components.decisiveConcentration === 1;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: `${trainResult.status}/${airLiftResult.status}`,
      decisions: trainResult.alternatives.length + airLiftResult.alternatives.length,
    });

    assert.equal((profile?.plan.strategyModules ?? []).includes('us.forceMultiplier'), true);
    assert.equal((profile?.plan.planTemplates ?? []).includes('us.trainAdvise'), true);
    assert.equal((profile?.plan.planTemplates ?? []).includes('us.airLiftTrain'), true);
    assert.equal(trainAdviseTemplate?.roles.adviseSpace?.selectorId, 'us.adviseTargetSpace');
    assert.equal(airLiftTrainTemplate?.roles.airLiftRoute?.selectorId, 'us.airLiftDestination');
    assert.equal(trainAdvise.roleBindings.adviseSpace?.components.indigenousForceMultiplier, 1);
    assert.equal(airLiftTrain.roleBindings.airLiftRoute?.components.decisiveConcentration, 1);
  });
});
