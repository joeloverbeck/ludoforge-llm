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
const SEED = 188_010_02;

describe('Spec 188 VC Base protection and NVA-rival witness', () => {
  it('binds the valid Rally/Subvert skeleton to Base protection and NVA ally-rival wiring', () => {
    const fixture = loadVcPlanFixture(SEED);
    const profile = fixture.def.agents?.profiles['vc-baseline'];
    const relationship = fixture.def.agents?.library.relationships?.['vc.nvaNominalAlly'];
    const posture = fixture.def.agents?.library.postureEvaluators?.['vc.protectOppositionAndBases'];
    const guardrail = fixture.def.agents?.library.guardrails?.['vc.protectBasesFromNvaInfiltrate'];
    const rallyTemplate = fixture.def.agents?.library.planTemplates?.['vc.rallySubvert'];
    const rallyResult = proposeVcPlan(fixture, ['rally']);
    const rallySubvert = requireAlternative(rallyResult, 'vc.rallySubvert');
    const passed = relationship?.seat === 'nva'
      && guardrail?.severity === 'demote'
      && posture?.must[0]?.id === 'resource-floor'
      && (profile?.plan.strategyModules ?? []).includes('vc.denyNvaIfNearWin')
      && (profile?.plan.planTemplates ?? []).includes('vc.rallySubvert')
      && !(profile?.plan.planTemplates ?? []).includes('vc.rallyResetTerror')
      && rallyTemplate?.roles.rallySpace?.selectorId === 'vc.rallyBaseOrUndergroundSpace'
      && rallySubvert.roleBindings.rallySpace?.components.baseProtection !== undefined;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'vc-baseline',
      seed: SEED,
      passed,
      stopReason: rallyResult.status,
      decisions: rallyResult.alternatives.length,
    });

    assert.equal(relationship?.seat, 'nva');
    assert.equal(guardrail?.severity, 'demote');
    assert.equal(posture?.must[0]?.id, 'resource-floor');
    assert.equal((profile?.plan.strategyModules ?? []).includes('vc.denyNvaIfNearWin'), true);
    assert.equal((profile?.plan.planTemplates ?? []).includes('vc.rallySubvert'), true);
    assert.equal((profile?.plan.planTemplates ?? []).includes('vc.rallyResetTerror'), false);
    assert.equal(rallyTemplate?.roles.rallySpace?.selectorId, 'vc.rallyBaseOrUndergroundSpace');
    assert.notEqual(rallySubvert.roleBindings.rallySpace?.components.baseProtection, undefined);
  });
});
