// @test-class: convergence-witness
// @profile-variant: us-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadUsPlanFixture, proposeUsPlan, requireAlternative } from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 202_006_02;

// Competence requirement (reports/fitl-competent-agent-ai.md §1): the US Train-as-Pacification
// carrier must select the highest-population space where Support can still improve. us.trainPacify
// binds us.pacifyTargetSpace, which scores zoneProp.population + a "support can improve" lookup.
describe('Spec 202 US Train/Pacify high-pop Support witness', () => {
  it('binds us.pacifyTargetSpace to a high-population space where Support can improve', () => {
    const fixture = loadUsPlanFixture(SEED);
    const result = proposeUsPlan(fixture, ['train']);
    const pacify = requireAlternative(result, 'us.trainPacify');
    const components = pacify.roleBindings.pacifySpace?.components;

    const passed = (components?.pacificationPopulation ?? 0) >= 6
      && components?.supportCanImprove === 1;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.ok(components, 'expected us.trainPacify to bind a pacifySpace role');
    assert.ok(
      (components.pacificationPopulation ?? 0) >= 6,
      `expected a high-population pacify target, got population ${components.pacificationPopulation}`,
    );
    assert.equal(components.supportCanImprove, 1, 'expected a space where Support can still improve');
  });
});
