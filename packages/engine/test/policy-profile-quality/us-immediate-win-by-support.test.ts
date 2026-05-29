// @test-class: convergence-witness
// @profile-variant: us-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadUsPlanFixture, proposeUsPlan, requireAlternative } from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 202_006_01;

// Competence requirement (§1): the US must be able to convert Train into a Support gain.
// us.trainPacify is proposable for a Train turn and binds a positive-population pacify target
// where Support can still improve — the Pacification carrier toward a Support win.
describe('Spec 202 US immediate-win-by-Support witness', () => {
  it('offers us.trainPacify as a Pacification carrier with a Support-improvable target', () => {
    const fixture = loadUsPlanFixture(SEED);
    const result = proposeUsPlan(fixture, ['train']);
    const pacify = requireAlternative(result, 'us.trainPacify');
    const components = pacify.roleBindings.pacifySpace?.components;

    const passed = (components?.pacificationPopulation ?? 0) > 0
      && components?.supportCanImprove === 1;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.ok(components, 'expected us.trainPacify pacifySpace binding');
    assert.ok((components.pacificationPopulation ?? 0) > 0, 'expected a populated pacify target');
    assert.equal(components.supportCanImprove, 1, 'expected Support still improvable at the target');
  });
});
