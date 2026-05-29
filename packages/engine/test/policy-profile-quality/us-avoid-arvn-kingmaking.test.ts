// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadUsPlanFixture, proposeUsPlan } from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 202_006_09;

// Competence requirement (§1): when ARVN nears a win and the US does not, the US must throttle
// Support gains that would king-make ARVN. Encoded by the bound us.avoidArvnKingmaking strategy
// module (suppresses us.trainPacify / us.patrolAdvise) AND the us.avoidArvnKingmaking guardrail
// (demotes Train/Pacify when arvnNearWin ∧ ¬usNearWin), reinforced by shared.allyRivalThrottle.
describe('Spec 202 US avoid-ARVN-kingmaking witness', () => {
  it('binds the ARVN-kingmaker throttle module and guardrail', () => {
    const fixture = loadUsPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const modules = fixture.profile.use.strategyModules ?? [];
    const guardrails = fixture.profile.use.guardrails ?? [];

    const moduleBound = modules.includes('us.avoidArvnKingmaking');
    const allyThrottleBound = modules.includes('shared.allyRivalThrottle');
    const guardrailBound = guardrails.includes('us.avoidArvnKingmaking');
    const moduleSuppresses = (lib?.strategyModules?.['us.avoidArvnKingmaking']?.suppressesPlanTemplates ?? [])
      .map(String);
    const suppressesPacifyCarriers = moduleSuppresses.includes('us.trainPacify')
      && moduleSuppresses.includes('us.patrolAdvise');
    const guardrailDemotes = lib?.guardrails?.['us.avoidArvnKingmaking']?.severity === 'demote';

    const passed = moduleBound && allyThrottleBound && guardrailBound
      && suppressesPacifyCarriers && guardrailDemotes;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: proposeUsPlan(fixture, ['train']).status,
      decisions: modules.length,
    });

    assert.ok(moduleBound, 'expected us.avoidArvnKingmaking strategy module bound');
    assert.ok(allyThrottleBound, 'expected shared.allyRivalThrottle bound');
    assert.ok(guardrailBound, 'expected us.avoidArvnKingmaking guardrail bound');
    assert.ok(suppressesPacifyCarriers, 'expected module to suppress us.trainPacify and us.patrolAdvise');
    assert.ok(guardrailDemotes, 'expected the kingmaking guardrail to demote');
  });
});
