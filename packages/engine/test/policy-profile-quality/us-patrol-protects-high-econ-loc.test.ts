// @test-class: convergence-witness
// @profile-variant: us-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadUsPlanFixture, proposeUsPlan, requireAlternative } from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 202_006_04;

// Competence requirement (§1): US Patrol is an economy/security carrier. us.patrolAdvise binds
// us.patrolLocTarget, which selects the Patrol LoC by Econ value (zoneProp.econ) — not by a
// generic projected margin. The chosen patrolLoc must carry positive Econ value.
describe('Spec 202 US Patrol protects high-Econ LoC witness', () => {
  it('selects the Patrol LoC by Econ value', () => {
    const fixture = loadUsPlanFixture(SEED);
    const result = proposeUsPlan(fixture, ['patrol']);
    const patrol = requireAlternative(result, 'us.patrolAdvise');
    const components = patrol.roleBindings.patrolLoc?.components;

    const passed = (components?.locEconValue ?? 0) >= 1;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.ok(components, 'expected us.patrolAdvise patrolLoc binding');
    assert.ok(
      (components.locEconValue ?? 0) >= 1,
      `expected a positive-Econ Patrol LoC, got locEconValue ${components.locEconValue}`,
    );
  });
});
