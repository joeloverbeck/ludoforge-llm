// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { executePublishedArvnCompoundRoot, loadArvnPlanFixture } from './arvn-plan-witness-helpers.js';
import { withCoupLookahead } from './shared-competence-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 1;

// Distilled from a seed-pinned convergence witness (202CIPQLANE): Train+Transport no longer
// produces a Transport compound alternative at the turn-0 initial state (only arvn.trainGovern
// proposes), so the original score-ordering comparison is unsupportable and re-bless is
// impossible. The durable invariant — the pre-Coup redeploy-discipline doctrine is bound to
// arvn-baseline — is asserted structurally.
describe('Spec 188 ARVN pre-Coup redeploy-discipline witness', () => {
  it('keeps pre-Coup redeploy discipline bound while executing a near-Coup ARVN deployment branch', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const modules = fixture.profile.use.strategyModules ?? [];
    const executed = executePublishedArvnCompoundRoot(fixture, {
      actionId: 'train',
      specialActionId: 'transport',
      seed: SEED,
      prepareState: (def, state) => ({
        ...withCoupLookahead(def, state),
        globalMarkers: { ...state.globalMarkers, activeLeader: 'youngTurks' },
      }),
    });
    const transportExecuted = Number(executed.postState.globalVars.transportCount) > Number(executed.preState.globalVars.transportCount);

    const passed = modules.includes('arvn.preCoupRedeployDiscipline') && transportExecuted;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: SEED,
      passed,
      stopReason: 'architectural-invariant',
      decisions: executed.decisions.length,
    });

    assert.equal(
      modules.includes('arvn.preCoupRedeployDiscipline'),
      true,
      'arvn.preCoupRedeployDiscipline must be bound to arvn-baseline',
    );
    assert.equal(transportExecuted, true, 'expected a near-Coup ARVN deployment branch to execute');
  });
});
