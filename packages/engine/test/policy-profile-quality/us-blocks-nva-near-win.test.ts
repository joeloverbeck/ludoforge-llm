// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadUsPlanFixture, proposeUsPlan } from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 202_006_06;

// Competence requirement (§1): when NVA nears a win, the US must be able to remove NVA
// Control/Base. The same block-current-leader + high-value-infrastructure-Assault doctrine
// (shared.blockCurrentLeader + us.assaultHighValueInfrastructure → us.assaultHighValueTarget)
// covers NVA as the current leader. Proven structurally (Assault yields no proposal at the
// initial state, so this is an architectural invariant over the compiled doctrine).
describe('Spec 202 US blocks NVA near-win witness', () => {
  it('encodes block-current-leader + high-value-infrastructure Assault doctrine for NVA', () => {
    const fixture = loadUsPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const modules = fixture.profile.use.strategyModules ?? [];
    const templates = fixture.profile.plan.planTemplates ?? [];

    const blocksLeader = modules.includes('shared.blockCurrentLeader');
    const nearCoupSwing = modules.includes('shared.nearCoupConcreteSwing');
    const hasInfrastructureAssault = templates.includes('us.assaultHighValueInfrastructure');
    const targetsHighValue = lib?.planTemplates?.['us.assaultHighValueInfrastructure']?.roles
      ?.assaultTarget?.selectorId === 'us.assaultHighValueTarget';

    const passed = blocksLeader && nearCoupSwing && hasInfrastructureAssault && targetsHighValue;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: proposeUsPlan(fixture, ['train']).status,
      decisions: templates.length,
    });

    assert.ok(blocksLeader, 'expected shared.blockCurrentLeader bound');
    assert.ok(nearCoupSwing, 'expected shared.nearCoupConcreteSwing bound');
    assert.ok(hasInfrastructureAssault, 'expected us.assaultHighValueInfrastructure bound');
    assert.ok(targetsHighValue, 'expected assaultTarget role to bind us.assaultHighValueTarget');
  });
});
