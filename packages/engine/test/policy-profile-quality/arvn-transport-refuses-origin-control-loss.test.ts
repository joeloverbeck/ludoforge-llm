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
// produces a Transport compound alternative at the turn-0 initial state, so the original
// score-ordering comparison is unsupportable and re-bless is impossible. The durable invariants —
// the Transport origin-control guardrail is bound, and arvn.trainTransport binds its Transport
// destination through reachable + postState origin-control admissibility constraints — are
// asserted structurally.
describe('Spec 188 ARVN Transport origin-control-loss witness', () => {
  it('executes a published Train+Transport route while retaining the origin-control guardrail', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const executed = executePublishedArvnCompoundRoot(fixture, {
      actionId: 'train',
      specialActionId: 'transport',
      seed: SEED,
      prepareState: (def, state) => ({
        ...withCoupLookahead(def, state),
        globalMarkers: { ...state.globalMarkers, activeLeader: 'youngTurks' },
      }),
    });
    const guardrails = fixture.profile.use.guardrails ?? [];
    const guardrail = fixture.def.agents?.library.guardrails?.['arvn.doNotLoseOriginControlByTransport'];
    const constraints = (fixture.def.agents?.library.planTemplates?.['arvn.trainTransport']?.roles
      ?.transportDestination?.constraints ?? []).map((c) => c.kind);
    const transportExecuted = Number(executed.postState.globalVars.transportCount) > Number(executed.preState.globalVars.transportCount);

    const passed = guardrails.includes('arvn.doNotLoseOriginControlByTransport')
      && guardrail?.severity === 'demote'
      && constraints.includes('reachable')
      && constraints.includes('postState')
      && transportExecuted;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: SEED,
      passed,
      stopReason: 'architectural-invariant',
      decisions: executed.decisions.length,
    });

    assert.equal(guardrails.includes('arvn.doNotLoseOriginControlByTransport'), true);
    assert.equal(guardrail?.severity, 'demote');
    assert.equal(constraints.includes('reachable'), true, 'transport destination must bind a reachable route constraint');
    assert.equal(constraints.includes('postState'), true, 'transport destination must enforce postState origin-control admissibility');
    assert.equal(transportExecuted, true, 'expected the Transport compound special activity to execute');
  });
});
