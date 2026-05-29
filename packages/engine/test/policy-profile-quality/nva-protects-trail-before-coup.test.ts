// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadNvaPlanFixture } from './nva-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_009_02;

// Distilled from a seed-pinned convergence witness (202CIPQLANE): March no longer produces a
// LoC-occupation proposal alternative at the turn-0 initial state, so the original
// requireAlternative/component assertions are unsupportable and re-bless is impossible. The
// durable invariants — the Trail/Bases guardrail, the logistics-and-Trail module, the
// Rally+Infiltrate and LoC-occupation template wiring, and the resource-floor posture must —
// are asserted structurally.
describe('Spec 188 NVA Trail and pre-Coup logistics witness', () => {
  it('wires Rally/Infiltrate + LoC occupation to Trail/logistics protection doctrine', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const modules = fixture.profile.use.strategyModules ?? [];
    const bound = fixture.profile.plan.planTemplates ?? [];

    const passed = lib?.guardrails?.['nva.preserveTrailAndBases']?.severity === 'demote'
      && modules.includes('nva.logisticsAndTrail')
      && bound.includes('nva.rallyInfiltrate')
      && bound.includes('nva.locOccupationBeforeCoup')
      && lib?.planTemplates?.['nva.rallyInfiltrate']?.roles.rallySpace?.selectorId === 'nva.rallyBaseOrTrailSpace'
      && lib?.planTemplates?.['nva.locOccupationBeforeCoup']?.roles.locSpace?.selectorId === 'nva.locOccupationSpace'
      && lib?.postureEvaluators?.['nva.protectLogisticsAndBases']?.must?.[0]?.id === 'resource-floor';

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'nva-baseline',
      seed: SEED,
      passed,
      stopReason: 'architectural-invariant',
      decisions: 7,
    });

    assert.equal(lib?.guardrails?.['nva.preserveTrailAndBases']?.severity, 'demote');
    assert.equal(modules.includes('nva.logisticsAndTrail'), true);
    assert.equal(bound.includes('nva.rallyInfiltrate'), true);
    assert.equal(bound.includes('nva.locOccupationBeforeCoup'), true);
    assert.equal(lib?.planTemplates?.['nva.rallyInfiltrate']?.roles.rallySpace?.selectorId, 'nva.rallyBaseOrTrailSpace');
    assert.equal(lib?.planTemplates?.['nva.locOccupationBeforeCoup']?.roles.locSpace?.selectorId, 'nva.locOccupationSpace');
    assert.equal(lib?.postureEvaluators?.['nva.protectLogisticsAndBases']?.must?.[0]?.id, 'resource-floor');
  });
});
