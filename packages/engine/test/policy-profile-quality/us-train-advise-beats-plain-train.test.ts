// @test-class: convergence-witness
// @profile-variant: us-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadUsPlanFixture, proposeUsPlan, requireAlternative } from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 202_006_03;

// Competence requirement (§1): when an indigenous force-multiplier (Advise) is available,
// us.trainAdvise should outscore the plain-Pacification us.trainPacify on a Train turn — the
// US uses Advise as a force multiplier rather than spending the operation purely on Pacify.
describe('Spec 202 US Train+Advise beats plain Train witness', () => {
  it('ranks us.trainAdvise above us.trainPacify on a Train turn', () => {
    const fixture = loadUsPlanFixture(SEED);
    const result = proposeUsPlan(fixture, ['train']);
    const trainAdvise = requireAlternative(result, 'us.trainAdvise');
    const trainPacify = requireAlternative(result, 'us.trainPacify');

    const passed = trainAdvise.score > trainPacify.score;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.ok(
      trainAdvise.score > trainPacify.score,
      `expected us.trainAdvise (${trainAdvise.score}) to outscore us.trainPacify (${trainPacify.score})`,
    );
  });
});
