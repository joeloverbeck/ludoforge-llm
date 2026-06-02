// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  loadArvnPlanFixture,
  proposeArvnPlan,
  requireAlternative,
} from './arvn-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_007_03;

// Distilled for Spec 205: selector cleanup gives Train+Govern a real trainPopulation
// score and legitimately shifts the selected template. The durable Patrol+Govern
// property is that the alternative remains ready and still binds the Econ LoC patrol target.
describe('Spec 188 ARVN Patrol+Govern Econ-threat witness', () => {
  it('keeps Patrol+Govern ready with the Econ LoC patrol target when Train+Govern outranks it', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const result = proposeArvnPlan(fixture, ['train', 'patrol']);
    const selected = result.selected;
    assert.equal(result.status, 'selected');
    assert.ok(selected, 'expected an ARVN plan selection');
    assert.equal(selected.templateId, 'arvn.trainGovern');
    const patrolGovern = requireAlternative(result, 'arvn.patrolGovern');
    const trainGovern = requireAlternative(result, 'arvn.trainGovern');
    const patrol = patrolGovern.roleBindings.patrolSpace;
    const passed = patrol?.selectedId === 'loc-saigon-can-tho:none'
      && patrol.components.econProtection === 2
      && trainGovern.score > patrolGovern.score;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.equal(patrol?.selectedId, 'loc-saigon-can-tho:none');
    assert.equal(patrol.components.econProtection, 2);
    assert.ok(trainGovern.score > patrolGovern.score);
  });
});
