// @test-class: convergence-witness
// @profile-variant: nva-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  loadNvaPlanFixture,
  proposeNvaPlan,
  requireAlternative,
} from './nva-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_009_02;

describe('Spec 188 NVA Trail and pre-Coup logistics witness', () => {
  it('binds Rally/Infiltrate and LoC occupation skeletons to Trail/logistics protection', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const profile = fixture.def.agents?.profiles['nva-baseline'];
    const rallyTemplate = fixture.def.agents?.library.planTemplates?.['nva.rallyInfiltrate'];
    const locTemplate = fixture.def.agents?.library.planTemplates?.['nva.locOccupationBeforeCoup'];
    const posture = fixture.def.agents?.library.postureEvaluators?.['nva.protectLogisticsAndBases'];
    const guardrail = fixture.def.agents?.library.guardrails?.['nva.preserveTrailAndBases'];
    const rallyResult = proposeNvaPlan(fixture, ['rally']);
    const marchResult = proposeNvaPlan(fixture, ['march']);
    const rallyInfiltrate = requireAlternative(rallyResult, 'nva.rallyInfiltrate');
    const locOccupation = requireAlternative(marchResult, 'nva.locOccupationBeforeCoup');
    const passed = guardrail?.severity === 'demote'
      && (profile?.plan.strategyModules ?? []).includes('nva.logisticsAndTrail')
      && (profile?.plan.planTemplates ?? []).includes('nva.rallyInfiltrate')
      && (profile?.plan.planTemplates ?? []).includes('nva.locOccupationBeforeCoup')
      && rallyTemplate?.roles.rallySpace?.selectorId === 'nva.rallyBaseOrTrailSpace'
      && locTemplate?.roles.locSpace?.selectorId === 'nva.locOccupationSpace'
      && posture?.must[0]?.id === 'resource-floor'
      && rallyInfiltrate.roleBindings.rallySpace?.components.trailAndBaseLogistics !== undefined
      && locOccupation.roleBindings.locSpace?.components.locMobilityThreat === 1;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'nva-baseline',
      seed: SEED,
      passed,
      stopReason: `${rallyResult.status}/${marchResult.status}`,
      decisions: rallyResult.alternatives.length + marchResult.alternatives.length,
    });

    assert.equal(guardrail?.severity, 'demote');
    assert.equal((profile?.plan.strategyModules ?? []).includes('nva.logisticsAndTrail'), true);
    assert.equal((profile?.plan.planTemplates ?? []).includes('nva.rallyInfiltrate'), true);
    assert.equal((profile?.plan.planTemplates ?? []).includes('nva.locOccupationBeforeCoup'), true);
    assert.equal(rallyTemplate?.roles.rallySpace?.selectorId, 'nva.rallyBaseOrTrailSpace');
    assert.equal(locTemplate?.roles.locSpace?.selectorId, 'nva.locOccupationSpace');
    assert.equal(posture?.must[0]?.id, 'resource-floor');
    assert.notEqual(rallyInfiltrate.roleBindings.rallySpace?.components.trailAndBaseLogistics, undefined);
    assert.equal(locOccupation.roleBindings.locSpace?.components.locMobilityThreat, 1);
  });
});
