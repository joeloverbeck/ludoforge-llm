// @test-class: convergence-witness
// @profile-variant: us-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  loadUsPlanFixture,
  proposeUsPlan,
  requireSelectedTemplate,
} from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_008_01;

describe('Spec 188 US Air Strike political-cost witness', () => {
  it('authors Sweep+Air Strike with safe-target quality and a populated-Support demotion guardrail', () => {
    const fixture = loadUsPlanFixture(SEED);
    const guardrail = fixture.def.agents?.library.guardrails?.['us.avoidPoliticalAirStrike'];
    const template = fixture.def.agents?.library.planTemplates?.['us.sweepAirStrike'];
    const profile = fixture.def.agents?.profiles['us-baseline'];
    const result = proposeUsPlan(fixture, ['sweep']);
    const selected = requireSelectedTemplate(result, 'us.sweepAirStrike');
    const airStrike = selected.roleBindings.airStrikeSpace;
    const passed = guardrail?.severity === 'demote'
      && guardrail.dependencies.candidateFeatures.includes('projectedUsMarginDelta')
      && (profile?.plan.guardrails ?? []).includes('us.avoidPoliticalAirStrike')
      && template?.steps[0]?.role === 'sweepSpace'
      && template.steps[1]?.role === 'airStrikeSpace'
      && airStrike?.components.zeroPopulationSafeStrike === 1;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.equal(guardrail?.severity, 'demote');
    assert.equal(guardrail.dependencies.candidateFeatures.includes('projectedUsMarginDelta'), true);
    assert.equal((profile?.plan.guardrails ?? []).includes('us.avoidPoliticalAirStrike'), true);
    assert.equal(template?.steps[0]?.role, 'sweepSpace');
    assert.equal(template.steps[1]?.role, 'airStrikeSpace');
    assert.equal(airStrike?.components.zeroPopulationSafeStrike, 1);
  });
});
