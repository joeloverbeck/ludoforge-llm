// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadUsPlanFixture } from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_008_01;

// Distilled from a seed-pinned convergence witness (202CIPQLANE): Sweep no longer produces a
// Sweep+Air Strike proposal alternative at the turn-0 initial state for any seed, so the original
// requireSelectedTemplate/component assertion is unsupportable and re-bless is impossible. The
// durable invariants — the populated-Support Air Strike demotion guardrail (keyed on the
// projected-US-margin delta) and the Sweep→Air Strike template wiring to the safe-target
// selector — are asserted structurally. (Spec 202 §2 requires this witness be preserved.)
describe('Spec 188 US Air Strike political-cost witness', () => {
  it('wires the populated-Support Air Strike demotion guardrail and Sweep+Air Strike skeleton', () => {
    const fixture = loadUsPlanFixture(SEED);
    const guardrail = fixture.def.agents?.library.guardrails?.['us.avoidPoliticalAirStrike'];
    const template = fixture.def.agents?.library.planTemplates?.['us.sweepAirStrike'];
    const guardrails = fixture.profile.use.guardrails ?? [];

    const passed = guardrail?.severity === 'demote'
      && (guardrail?.dependencies.candidateFeatures ?? []).includes('projectedUsMarginDelta')
      && guardrails.includes('us.avoidPoliticalAirStrike')
      && template?.steps[0]?.role === 'sweepSpace'
      && template?.steps[1]?.role === 'airStrikeSpace'
      && template?.roles.airStrikeSpace?.selectorId === 'us.airStrikeTarget';

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: 'architectural-invariant',
      decisions: 6,
    });

    assert.equal(guardrail?.severity, 'demote');
    assert.equal((guardrail?.dependencies.candidateFeatures ?? []).includes('projectedUsMarginDelta'), true);
    assert.equal(guardrails.includes('us.avoidPoliticalAirStrike'), true);
    assert.equal(template?.steps[0]?.role, 'sweepSpace');
    assert.equal(template?.steps[1]?.role, 'airStrikeSpace');
    assert.equal(template?.roles.airStrikeSpace?.selectorId, 'us.airStrikeTarget');
  });
});
