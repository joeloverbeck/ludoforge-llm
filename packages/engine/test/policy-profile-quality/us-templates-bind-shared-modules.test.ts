// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadUsPlanFixture, proposeUsPlan } from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 202_006_11;

const REQUIRED_SHARED_MODULES = [
  'shared.immediateWin',
  'shared.blockCurrentLeader',
  'shared.nearCoupConcreteSwing',
  'shared.eventDirectSwing',
] as const;

// Architectural invariant (Spec 202 §7): us-baseline must bind the shared doctrine modules
// from Spec 201 — the US event direct-swing / immediate-win / block-leader / near-coup doctrine
// is carried by these shared modules (us.eventDirectSwing is deliberately not a plan template).
describe('Spec 202 US shared-module binding invariant', () => {
  it('us-baseline binds the required shared.* strategy modules', () => {
    const fixture = loadUsPlanFixture(SEED);
    const bound = fixture.profile.use.strategyModules ?? [];
    const missing = REQUIRED_SHARED_MODULES.filter((m) => !bound.includes(m));

    const passed = missing.length === 0;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: proposeUsPlan(fixture, ['train']).status,
      decisions: REQUIRED_SHARED_MODULES.length,
    });

    assert.deepEqual(missing, [], `us-baseline is missing shared modules: ${missing.join(', ')}`);
  });
});
