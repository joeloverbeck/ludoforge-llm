// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadUsPlanFixture, proposeUsPlan } from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 202_006_05;

// Competence requirement (§1): when VC nears a win, the US must be able to remove VC
// Base/Control rather than chase body count. This capability is encoded by the bound
// shared.blockCurrentLeader module plus the us.assaultHighValueInfrastructure template, which
// binds us.assaultHighValueTarget (an Opposition-stronghold-targeting selector).
// Behavioral proposal of Assault is not available at the initial state (no enemy targets yet),
// so the requirement is proven structurally over the compiled doctrine (architectural invariant).
describe('Spec 202 US blocks VC near-win witness', () => {
  it('encodes block-current-leader + high-value-infrastructure Assault doctrine', () => {
    const fixture = loadUsPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const modules = fixture.profile.use.strategyModules ?? [];
    const templates = fixture.profile.plan.planTemplates ?? [];

    const blocksLeader = modules.includes('shared.blockCurrentLeader');
    const hasInfrastructureAssault = templates.includes('us.assaultHighValueInfrastructure');
    const targetsHighValue = lib?.planTemplates?.['us.assaultHighValueInfrastructure']?.roles
      ?.assaultTarget?.selectorId === 'us.assaultHighValueTarget';

    const passed = blocksLeader && hasInfrastructureAssault && targetsHighValue;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: proposeUsPlan(fixture, ['train']).status,
      decisions: templates.length,
    });

    assert.ok(blocksLeader, 'expected shared.blockCurrentLeader bound');
    assert.ok(hasInfrastructureAssault, 'expected us.assaultHighValueInfrastructure bound');
    assert.ok(targetsHighValue, 'expected assaultTarget role to bind us.assaultHighValueTarget');
  });
});
