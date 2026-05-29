// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadUsPlanFixture, proposeUsPlan } from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 202_006_07;

// Competence requirement (§1): the US should Air Strike zero-population / Trail targets and avoid
// Air Strike in populated Support. Positive companion to the preserved
// us-avoids-airstrike-populated-support witness. Structurally: us.sweepAirStrike binds the
// us.airStrikeTarget selector (which scores zero-population safe strikes), and the
// us.avoidPoliticalAirStrike guardrail demotes Air Strike on populated Support. (Sweep/Air Strike
// yield no proposal at the initial state, so this is proven as an architectural invariant.)
describe('Spec 202 US Sweep/Air Strike prefers zero-pop-or-Trail witness', () => {
  it('wires the safe-target Air Strike selector and the populated-Support demotion guardrail', () => {
    const fixture = loadUsPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const templates = fixture.profile.plan.planTemplates ?? [];
    const guardrails = fixture.profile.use.guardrails ?? [];

    const hasSweepAirStrike = templates.includes('us.sweepAirStrike');
    const targetsAirStrikeSelector = lib?.planTemplates?.['us.sweepAirStrike']?.roles
      ?.airStrikeSpace?.selectorId === 'us.airStrikeTarget';
    const demotesPoliticalAirStrike = guardrails.includes('us.avoidPoliticalAirStrike');

    const passed = hasSweepAirStrike && targetsAirStrikeSelector && demotesPoliticalAirStrike;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: proposeUsPlan(fixture, ['train']).status,
      decisions: templates.length,
    });

    assert.ok(hasSweepAirStrike, 'expected us.sweepAirStrike bound');
    assert.ok(targetsAirStrikeSelector, 'expected airStrikeSpace role to bind us.airStrikeTarget');
    assert.ok(demotesPoliticalAirStrike, 'expected us.avoidPoliticalAirStrike guardrail bound');
  });
});
