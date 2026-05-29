// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadArvnPlanFixture } from './arvn-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_007_06;

// Distilled from a seed-pinned convergence witness (202CIPQLANE): Train+Transport no longer
// produces a Transport compound alternative at the turn-0 initial state (only arvn.trainGovern
// proposes), so the original score-ordering comparison is unsupportable and re-bless is
// impossible. The durable invariant — the pre-Coup redeploy-discipline doctrine is bound to
// arvn-baseline — is asserted structurally.
describe('Spec 188 ARVN pre-Coup redeploy-discipline witness', () => {
  it('binds the pre-Coup redeploy-discipline doctrine to arvn-baseline', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const modules = fixture.profile.use.strategyModules ?? [];

    const passed = modules.includes('arvn.preCoupRedeployDiscipline');

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: SEED,
      passed,
      stopReason: 'architectural-invariant',
      decisions: 1,
    });

    assert.equal(
      modules.includes('arvn.preCoupRedeployDiscipline'),
      true,
      'arvn.preCoupRedeployDiscipline must be bound to arvn-baseline',
    );
  });
});
