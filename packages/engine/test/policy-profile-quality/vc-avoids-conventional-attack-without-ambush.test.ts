// @test-class: convergence-witness
// @profile-variant: vc-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  loadVcPlanFixture,
  proposeVcPlan,
  requireAlternative,
} from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_010_01;

describe('Spec 188 VC Attack/Ambush restraint witness', () => {
  it('binds conventional Attack restraint to the surgical Ambush skeleton', () => {
    const fixture = loadVcPlanFixture(SEED);
    const profile = fixture.def.agents?.profiles['vc-baseline'];
    const guardrail = fixture.def.agents?.library.guardrails?.['vc.avoidConventionalAttackWithoutAmbush'];
    const template = fixture.def.agents?.library.planTemplates?.['vc.marchAmbushFromLoc'];
    const result = proposeVcPlan(fixture, ['march']);
    const marchAmbush = requireAlternative(result, 'vc.marchAmbushFromLoc');
    const passed = guardrail?.severity === 'demote'
      && (profile?.plan.guardrails ?? []).includes('vc.avoidConventionalAttackWithoutAmbush')
      && (profile?.plan.strategyModules ?? []).includes('vc.fundAndAmbushCarefully')
      && (profile?.plan.planTemplates ?? []).includes('vc.marchAmbushFromLoc')
      && template?.roles.locPlatform?.selectorId === 'vc.locAmbushPlatform'
      && template?.roles.ambushSpace?.selectorId === 'vc.ambushSurgicalTargetSpace'
      && marchAmbush.roleBindings.locPlatform?.components.locPlatform === 1
      && marchAmbush.roleBindings.ambushSpace?.components.coinPieceThreat === 1;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'vc-baseline',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.equal(guardrail?.severity, 'demote');
    assert.equal((profile?.plan.guardrails ?? []).includes('vc.avoidConventionalAttackWithoutAmbush'), true);
    assert.equal((profile?.plan.strategyModules ?? []).includes('vc.fundAndAmbushCarefully'), true);
    assert.equal((profile?.plan.planTemplates ?? []).includes('vc.marchAmbushFromLoc'), true);
    assert.equal(template?.roles.locPlatform?.selectorId, 'vc.locAmbushPlatform');
    assert.equal(template?.roles.ambushSpace?.selectorId, 'vc.ambushSurgicalTargetSpace');
    assert.equal(marchAmbush.roleBindings.locPlatform?.components.locPlatform, 1);
    assert.equal(marchAmbush.roleBindings.ambushSpace?.components.coinPieceThreat, 1);
  });
});
