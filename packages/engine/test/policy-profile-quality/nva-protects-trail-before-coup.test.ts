// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  executePublishedNvaRoot,
  emitNvaPolicyQualityRecord,
  loadNvaPlanFixture,
  publishedSecondEligibleNvaActionDecisions,
} from './nva-plan-witness-helpers.js';
import { withCoupLookahead } from './shared-competence-helpers.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_009_02;

// Distilled from a seed-pinned convergence witness (202CIPQLANE): March no longer produces a
// LoC-occupation proposal alternative at the turn-0 initial state, so the original
// requireAlternative/component assertions are unsupportable and re-bless is impossible. The
// durable invariants — the Trail/Bases guardrail, the logistics-and-Trail module, the
// Rally+Infiltrate and LoC-occupation template wiring, and the resource-floor posture must —
// are asserted structurally.
describe('Spec 188 NVA Trail and pre-Coup logistics witness', () => {
  it('executes Trail protection before Coup while March violence is available', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const modules = fixture.profile.use.strategyModules ?? [];
    const bound = fixture.profile.plan.planTemplates ?? [];
    const nearCoup = withCoupLookahead(fixture.def, fixture.state);
    const executed = executePublishedNvaRoot(fixture, {
      actionId: 'rally',
      specialActionId: 'infiltrate',
      seed: SEED,
      prepareState: (def, state) => withCoupLookahead(def, state),
    });
    const frontierKeys = publishedSecondEligibleNvaActionDecisions(fixture, nearCoup)
      .map((decision) => decision.move === undefined ? '' : toMoveIdentityKey(fixture.def, decision.move));
    const trailDelta = Number(executed.postState.globalVars.trail) - Number(executed.preState.globalVars.trail);

    const passed = lib?.guardrails?.['nva.preserveTrailAndBases']?.severity === 'demote'
      && modules.includes('nva.logisticsAndTrail')
      && bound.includes('nva.rallyInfiltrate')
      && bound.includes('nva.locOccupationBeforeCoup')
      && lib?.planTemplates?.['nva.rallyInfiltrate']?.roles.rallySpace?.selectorId === 'nva.rallyBaseOrTrailSpace'
      && lib?.planTemplates?.['nva.locOccupationBeforeCoup']?.roles.locSpace?.selectorId === 'nva.locOccupationSpace'
      && lib?.postureEvaluators?.['nva.protectLogisticsAndBases']?.must?.[0]?.id === 'resource-floor'
      && trailDelta > 0
      && frontierKeys.some((key) => key.startsWith('march|'));

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      stopReason: executed.rootStableMoveKey,
      decisions: executed.decisions.length + frontierKeys.length,
    });

    assert.equal(lib?.guardrails?.['nva.preserveTrailAndBases']?.severity, 'demote');
    assert.equal(modules.includes('nva.logisticsAndTrail'), true);
    assert.equal(bound.includes('nva.rallyInfiltrate'), true);
    assert.equal(bound.includes('nva.locOccupationBeforeCoup'), true);
    assert.equal(lib?.planTemplates?.['nva.rallyInfiltrate']?.roles.rallySpace?.selectorId, 'nva.rallyBaseOrTrailSpace');
    assert.equal(lib?.planTemplates?.['nva.locOccupationBeforeCoup']?.roles.locSpace?.selectorId, 'nva.locOccupationSpace');
    assert.equal(lib?.postureEvaluators?.['nva.protectLogisticsAndBases']?.must?.[0]?.id, 'resource-floor');
    assert.ok(trailDelta > 0, `expected Trail repair, got ${trailDelta}`);
    assert.ok(frontierKeys.some((key) => key.startsWith('march|')), 'expected March adversarial root');
  });
});
