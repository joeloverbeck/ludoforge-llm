// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadUsPlanFixture, proposeUsPlan } from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 202_006_10;

// Spec 202 §4.1 decision: us.airLiftTrain is deliberately NOT authored. The compound shape
// "Air Lift before Training to make a Pacification target legal" needs the airLift→train microturn
// sequencing surface to be verifiable, and no current witness proves the construction is safe.
// The decision is reversible via a follow-up ticket. This witness guards the exclusion (it must be
// neither defined in the library nor bound into us-baseline).
describe('Spec 202 US Air Lift+Train not-enabled witness', () => {
  it('does not define or bind us.airLiftTrain', () => {
    const fixture = loadUsPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const boundTemplates = fixture.profile.plan.planTemplates ?? [];

    const definedInLibrary = 'us.airLiftTrain' in (lib?.planTemplates ?? {});
    const boundToProfile = boundTemplates.includes('us.airLiftTrain');

    const passed = !definedInLibrary && !boundToProfile;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: proposeUsPlan(fixture, ['train']).status,
      decisions: boundTemplates.length,
    });

    assert.equal(definedInLibrary, false, 'us.airLiftTrain must not be defined in the plan-template library');
    assert.equal(boundToProfile, false, 'us.airLiftTrain must not be bound into us-baseline');
  });
});
