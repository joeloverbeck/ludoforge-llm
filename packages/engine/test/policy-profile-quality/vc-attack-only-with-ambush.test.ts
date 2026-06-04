// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { applyMove } from '../../src/kernel/index.js';
import {
  loadFitlProductionDef,
  runFitlCompetenceCase,
} from './shared-competence-helpers.js';
import {
  assertProfileBinds,
  actionDecision,
  countFactionInZone,
  compoundActionDecision,
  emitVcArchitecturalRecord,
  loadVcPlanFixture,
  prepareVcAttackAmbushState,
  proposeVcPlanFromDecisions,
  vcAttackMove,
} from './vc-plan-witness-helpers.js';

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

  it('executes Attack+Ambush for stronger removal than conventional Attack', () => {
    const def = loadFitlProductionDef();
    const fixture = loadVcPlanFixture(210_001);
    const run = runFitlCompetenceCase(def, {
      seatId: 'vc',
      playerIndex: 3,
      seed: 210_001,
      prepareState: prepareVcAttackAmbushState,
    });
    const before = run.preState;
    const proposal = proposeVcPlanFromDecisions(fixture, [
      compoundActionDecision('attack', 'ambushVc', { timing: 'after' }),
      actionDecision('attack'),
    ], before);
    const conventional = applyMove(def, before, vcAttackMove(false)).state;
    const ambush = applyMove(def, before, vcAttackMove(true)).state;
    const conventionalRemoved = countFactionInZone(before, 'saigon:none', 'US') - countFactionInZone(conventional, 'saigon:none', 'US');
    const ambushRemoved = countFactionInZone(before, 'saigon:none', 'US') - countFactionInZone(ambush, 'saigon:none', 'US');
    const passed = proposal.selected?.templateId === 'vc.attackAmbush'
      && conventionalRemoved === 2
      && ambushRemoved === 3;

    emitVcArchitecturalRecord(TEST_FILE, 210_001, passed, 2);

    assert.equal(proposal.selected?.templateId, 'vc.attackAmbush');
    assert.equal(conventionalRemoved, 2);
    assert.equal(ambushRemoved, 3);
    assert.equal(ambushRemoved > conventionalRemoved, true);
  });
});
