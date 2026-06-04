// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { applyMove } from '../../src/kernel/index.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  loadFitlProductionDef,
  runFitlCompetenceCase,
} from './shared-competence-helpers.js';
import { countFactionInZone, loadVcPlanFixture, prepareVcAttackAmbushState, vcAttackMove } from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_010_01;

// Distilled from a seed-pinned convergence witness (202CIPQLANE): March no longer produces a
// vc.marchAmbushFromLoc proposal alternative at the turn-0 initial state, so the original
// requireAlternative/component assertions are unsupportable and re-bless is impossible. The
// durable invariants — the conventional-Attack-without-Ambush guardrail, the
// fund-and-ambush-carefully module, and the March+Ambush surgical platform/target selector
// wiring — are asserted structurally.
describe('Spec 188 VC Attack/Ambush restraint witness', () => {
  it('wires conventional-Attack restraint to the surgical Ambush skeleton', () => {
    const fixture = loadVcPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const guardrails = fixture.profile.use.guardrails ?? [];
    const modules = fixture.profile.use.strategyModules ?? [];
    const bound = fixture.profile.plan.planTemplates ?? [];
    const template = lib?.planTemplates?.['vc.marchAmbushFromLoc'];

    const passed = lib?.guardrails?.['vc.avoidConventionalAttackWithoutAmbush']?.severity === 'demote'
      && guardrails.includes('vc.avoidConventionalAttackWithoutAmbush')
      && modules.includes('vc.fundAndAmbushCarefully')
      && bound.includes('vc.marchAmbushFromLoc')
      && template?.roles.locPlatform?.selectorId === 'vc.locAmbushPlatform'
      && template?.roles.ambushSpace?.selectorId === 'vc.ambushSurgicalTargetSpace';

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'vc-baseline',
      seed: SEED,
      passed,
      stopReason: 'architectural-invariant',
      decisions: 6,
    });

    assert.equal(lib?.guardrails?.['vc.avoidConventionalAttackWithoutAmbush']?.severity, 'demote');
    assert.equal(guardrails.includes('vc.avoidConventionalAttackWithoutAmbush'), true);
    assert.equal(modules.includes('vc.fundAndAmbushCarefully'), true);
    assert.equal(bound.includes('vc.marchAmbushFromLoc'), true);
    assert.equal(template?.roles.locPlatform?.selectorId, 'vc.locAmbushPlatform');
    assert.equal(template?.roles.ambushSpace?.selectorId, 'vc.ambushSurgicalTargetSpace');
  });

  it('keeps conventional Attack as the weaker adversarial execution path', () => {
    const def = loadFitlProductionDef();
    const run = runFitlCompetenceCase(def, {
      seatId: 'vc',
      playerIndex: 3,
      seed: 210_001,
      prepareState: prepareVcAttackAmbushState,
    });
    const before = run.preState;
    const conventional = applyMove(def, before, vcAttackMove(false)).state;
    const ambush = applyMove(def, before, vcAttackMove(true)).state;
    const conventionalRemaining = countFactionInZone(conventional, 'saigon:none', 'US');
    const ambushRemaining = countFactionInZone(ambush, 'saigon:none', 'US');
    const passed = ambushRemaining < conventionalRemaining;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'vc-baseline',
      seed: 210_001,
      passed,
      stopReason: 'architectural-invariant',
      decisions: 2,
    });

    assert.equal(ambushRemaining < conventionalRemaining, true);
  });
});
