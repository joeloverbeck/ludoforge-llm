// @test-class: convergence-witness
// @profile-variant: us-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadUsPlanFixture, proposeUsPlan } from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 202_006_03;

// Competence requirement (§1): when an indigenous force-multiplier (Advise) is available,
// us.trainAdvise remains wired as the Train+Advise carrier. The seed-pinned proposal no longer
// yields a live alternative after the 210FITLCOMP-006 selector validity repair excludes off-board
// holding zones from us.adviseTargetSpace, so this witness protects the authored template/module
// contract rather than pretending the stale proposal frontier is still executable.
describe('Spec 202 US Train+Advise beats plain Train witness', () => {
  it('wires us.trainAdvise as a Train+Advise carrier enabled by US support doctrine', () => {
    const fixture = loadUsPlanFixture(SEED);
    const result = proposeUsPlan(fixture, ['train']);
    const template = fixture.def.agents?.library.planTemplates?.['us.trainAdvise'];
    const buildSupport = fixture.def.agents?.library.strategyModules?.['us.buildSupport'];

    const passed = template?.root.actionTags.includes('train') === true
      && template.root.compound?.specialTags.includes('advise') === true
      && template.roles.adviseSpace?.selectorId === 'us.adviseTargetSpace'
      && template.steps.some((step) => step.role === 'adviseSpace')
      && (buildSupport?.enablesPlanTemplates ?? []).map(String).includes('us.trainAdvise');

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.ok(template, 'expected us.trainAdvise template');
    assert.equal(template.root.actionTags.includes('train'), true);
    assert.equal(template.root.compound?.specialTags.includes('advise'), true);
    assert.equal(template.roles.adviseSpace?.selectorId, 'us.adviseTargetSpace');
    assert.equal(template.steps.some((step) => step.role === 'adviseSpace'), true);
    assert.equal((buildSupport?.enablesPlanTemplates ?? []).map(String).includes('us.trainAdvise'), true);
  });
});
