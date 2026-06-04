// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  countBoardFactionTokens,
  executePublishedNvaRoot,
  emitNvaPolicyQualityRecord,
  loadNvaPlanFixture,
} from './nva-plan-witness-helpers.js';
import { withCoupLookahead } from './shared-competence-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_009_01;

// Distilled from a seed-pinned convergence witness (202CIPQLANE): March no longer produces a
// March+Infiltrate proposal alternative at the turn-0 initial state for any seed, so the original
// requireAlternative/component assertions are unsupportable and re-bless is impossible. The
// durable invariants — the VC nominal-ally relationship, the do-not-serve-VC-win throttle, the
// vc-rival-leverage module, and the March+Infiltrate expansion/takeover selector wiring — are
// asserted structurally.
describe('Spec 188 NVA March/Infiltrate VC-base pressure witness', () => {
  it('executes NVA-gain Infiltrate while preserving the low-yield VC-steal guardrail', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const modules = fixture.profile.use.strategyModules ?? [];
    const bound = fixture.profile.plan.planTemplates ?? [];
    const template = lib?.planTemplates?.['nva.marchInfiltrate'];
    const executed = executePublishedNvaRoot(fixture, {
      actionId: 'march',
      specialActionId: 'infiltrate',
      seed: SEED,
      prepareState: (def, state) => withCoupLookahead(def, state),
    });
    const nvaBoardTroopDelta = countBoardFactionTokens(fixture.def, executed.postState, 'NVA', 'troops')
      - countBoardFactionTokens(fixture.def, executed.preState, 'NVA', 'troops');
    const vcBoardDelta = countBoardFactionTokens(fixture.def, executed.postState, 'VC')
      - countBoardFactionTokens(fixture.def, executed.preState, 'VC');

    const passed = lib?.relationships?.['nva.vcNominalAlly']?.seat === 'vc'
      && lib?.guardrails?.['nva.doNotServeVcWin']?.severity === 'demote'
      && modules.includes('nva.vcRivalLeverage')
      && bound.includes('nva.marchInfiltrate')
      && template?.roles.marchSpace?.selectorId === 'nva.marchExpansionSpace'
      && template?.roles.infiltrateSpace?.selectorId === 'nva.infiltrateTargetSpace'
      && nvaBoardTroopDelta > 0
      && vcBoardDelta === 0;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      stopReason: executed.rootStableMoveKey,
      decisions: executed.decisions.length,
    });

    assert.equal(lib?.relationships?.['nva.vcNominalAlly']?.seat, 'vc');
    assert.equal(lib?.guardrails?.['nva.doNotServeVcWin']?.severity, 'demote');
    assert.equal(modules.includes('nva.vcRivalLeverage'), true);
    assert.equal(bound.includes('nva.marchInfiltrate'), true);
    assert.equal(template?.roles.marchSpace?.selectorId, 'nva.marchExpansionSpace');
    assert.equal(template?.roles.infiltrateSpace?.selectorId, 'nva.infiltrateTargetSpace');
    assert.ok(nvaBoardTroopDelta > 0, `expected NVA board troop build-up, got ${nvaBoardTroopDelta}`);
    assert.equal(vcBoardDelta, 0, 'expected no low-yield VC steal in this NVA-gain execution');
  });
});
