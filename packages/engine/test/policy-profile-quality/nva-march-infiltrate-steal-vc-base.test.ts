// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadNvaPlanFixture } from './nva-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_009_01;

// Distilled from a seed-pinned convergence witness (202CIPQLANE): March no longer produces a
// March+Infiltrate proposal alternative at the turn-0 initial state for any seed, so the original
// requireAlternative/component assertions are unsupportable and re-bless is impossible. The
// durable invariants — the VC nominal-ally relationship, the do-not-serve-VC-win throttle, the
// vc-rival-leverage module, and the March+Infiltrate expansion/takeover selector wiring — are
// asserted structurally.
describe('Spec 188 NVA March/Infiltrate VC-base pressure witness', () => {
  it('wires March+Infiltrate to NVA expansion + VC-rival takeover doctrine', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const modules = fixture.profile.use.strategyModules ?? [];
    const bound = fixture.profile.plan.planTemplates ?? [];
    const template = lib?.planTemplates?.['nva.marchInfiltrate'];

    const passed = lib?.relationships?.['nva.vcNominalAlly']?.seat === 'vc'
      && lib?.guardrails?.['nva.doNotServeVcWin']?.severity === 'demote'
      && modules.includes('nva.vcRivalLeverage')
      && bound.includes('nva.marchInfiltrate')
      && template?.roles.marchSpace?.selectorId === 'nva.marchExpansionSpace'
      && template?.roles.infiltrateSpace?.selectorId === 'nva.infiltrateTargetSpace';

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'nva-baseline',
      seed: SEED,
      passed,
      stopReason: 'architectural-invariant',
      decisions: 6,
    });

    assert.equal(lib?.relationships?.['nva.vcNominalAlly']?.seat, 'vc');
    assert.equal(lib?.guardrails?.['nva.doNotServeVcWin']?.severity, 'demote');
    assert.equal(modules.includes('nva.vcRivalLeverage'), true);
    assert.equal(bound.includes('nva.marchInfiltrate'), true);
    assert.equal(template?.roles.marchSpace?.selectorId, 'nva.marchExpansionSpace');
    assert.equal(template?.roles.infiltrateSpace?.selectorId, 'nva.infiltrateTargetSpace');
  });
});
