// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertProfileBinds, emitVcArchitecturalRecord, loadVcPlanFixture } from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 204_008_05;

describe('Spec 204 VC Attack/Ambush witness', () => {
  it('binds VC Attack to Ambush compound and preserves conventional-Attack restraint', () => {
    const fixture = loadVcPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const template = lib?.planTemplates?.['vc.attackAmbush'];
    const guardrail = lib?.guardrails?.['vc.avoidConventionalAttackWithoutAmbush'];

    const passed = template?.root.actionTags.includes('attack') === true
      && template?.root.compound?.specialTags.includes('ambush-vc') === true
      && template?.roles.attackSpace?.selectorId === 'vc.attackAmbushTarget'
      && template?.postureHook === 'vc.preserveUndergroundAndBases'
      && guardrail?.severity === 'demote';

    emitVcArchitecturalRecord(TEST_FILE, SEED, passed);

    assert.equal(template?.root.actionTags.includes('attack'), true);
    assert.equal(template?.root.compound?.specialTags.includes('ambush-vc'), true);
    assert.equal(template?.roles.attackSpace?.selectorId, 'vc.attackAmbushTarget');
    assert.equal(template?.postureHook, 'vc.preserveUndergroundAndBases');
    assert.equal(guardrail?.severity, 'demote');
    assertProfileBinds(fixture, {
      guardrails: ['vc.avoidConventionalAttackWithoutAmbush'],
      planTemplates: ['vc.attackAmbush'],
    });
  });
});
