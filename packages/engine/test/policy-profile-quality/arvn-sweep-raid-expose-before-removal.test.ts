// @test-class: convergence-witness
// @profile-variant: arvn-evolved
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  loadArvnPlanFixture,
  proposeArvnPlan,
  requireSelectedTemplate,
} from './arvn-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_007_04;

describe('Spec 188 ARVN Sweep+Raid expose-before-removal witness', () => {
  it('binds the Sweep role before Raid removal roles in the authored plan', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const template = fixture.def.agents?.library.planTemplates?.['arvn.sweepRaid'];
    const result = proposeArvnPlan(fixture, ['sweep']);
    const selected = requireSelectedTemplate(result, 'arvn.sweepRaid');
    const sweep = selected.roleBindings.sweepSpace;
    const raid = selected.roleBindings.raidSpace;
    const passed = template?.steps[0]?.role === 'sweepSpace'
      && template.steps[1]?.role === 'raidSpace'
      && sweep?.components.exposeUndergroundThreat === 1
      && raid?.components.baseOrUndergroundRemoval === 1;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-evolved',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.equal(template?.steps[0]?.role, 'sweepSpace');
    assert.equal(template.steps[1]?.role, 'raidSpace');
    assert.equal(sweep?.components.exposeUndergroundThreat, 1);
    assert.equal(raid?.components.baseOrUndergroundRemoval, 1);
  });
});
