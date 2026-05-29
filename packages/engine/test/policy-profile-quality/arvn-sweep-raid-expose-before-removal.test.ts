// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadArvnPlanFixture } from './arvn-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_007_04;

// Distilled from a seed-pinned convergence witness (202CIPQLANE): Sweep/Raid no longer
// produces a standalone proposal alternative at the turn-0 initial state for any seed
// (the proposer requires the op to be legal in-state), so the original requireSelectedTemplate
// assertion is unsupportable and re-bless is impossible. The durable invariant — arvn.sweepRaid
// exposes (Sweep) before removing (Raid), wired to the expose/removal selectors — is asserted
// structurally over the compiled doctrine.
describe('Spec 188 ARVN Sweep+Raid expose-before-removal witness', () => {
  it('wires arvn.sweepRaid to expose-before-removal selectors', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const template = fixture.def.agents?.library.planTemplates?.['arvn.sweepRaid'];
    const bound = fixture.profile.plan.planTemplates ?? [];

    const passed = bound.includes('arvn.sweepRaid')
      && template?.steps[0]?.role === 'sweepSpace'
      && template?.steps[1]?.role === 'raidSpace'
      && template?.roles.sweepSpace?.selectorId === 'arvn.sweepToExposeSpace'
      && template?.roles.raidSpace?.selectorId === 'arvn.raidRemovalTarget';

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: SEED,
      passed,
      stopReason: 'architectural-invariant',
      decisions: 4,
    });

    assert.equal(bound.includes('arvn.sweepRaid'), true, 'arvn.sweepRaid must be bound to arvn-baseline');
    assert.equal(template?.steps[0]?.role, 'sweepSpace');
    assert.equal(template?.steps[1]?.role, 'raidSpace');
    assert.equal(template?.roles.sweepSpace?.selectorId, 'arvn.sweepToExposeSpace');
    assert.equal(template?.roles.raidSpace?.selectorId, 'arvn.raidRemovalTarget');
  });
});
