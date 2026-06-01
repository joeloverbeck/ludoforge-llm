// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertProfileBinds, emitVcArchitecturalRecord, includesId, loadVcPlanFixture } from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 204_008_07;

describe('Spec 204 VC NVA near-win block witness', () => {
  it('binds NVA-rival risk doctrine and Base-protection guardrails', () => {
    const fixture = loadVcPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const module = lib?.strategyModules?.['vc.nvaRivalRisk'];
    const posture = lib?.postureEvaluators?.['vc.avoidNvaKingmaking'];
    const guardrail = lib?.guardrails?.['vc.protectBasesFromNvaInfiltrate'];

    const passed = includesId(module?.suppressesPlanTemplates, 'vc.rallyBaseNetwork')
      && posture?.prefer.some((entry) => entry.id === 'nva-kingmaking' && entry.hasWhen && entry.hasFallbackContribution) === true
      && guardrail?.severity === 'demote';

    emitVcArchitecturalRecord(TEST_FILE, SEED, passed);

    assert.equal(includesId(module?.suppressesPlanTemplates, 'vc.rallyBaseNetwork'), true);
    assert.equal(posture?.prefer.some((entry) => entry.id === 'nva-kingmaking' && entry.hasWhen && entry.hasFallbackContribution), true);
    assert.equal(guardrail?.severity, 'demote');
    assertProfileBinds(fixture, {
      guardrails: ['vc.protectBasesFromNvaInfiltrate'],
      strategyModules: ['vc.nvaRivalRisk'],
    });
  });
});
