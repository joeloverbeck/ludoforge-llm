// @test-class: convergence-witness
// @profile-variant: arvn-evolved
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  loadArvnPlanFixture,
  proposeArvnPlan,
  requireAlternative,
  requireSelectedTemplate,
} from './arvn-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_007_03;

describe('Spec 188 ARVN Patrol+Govern Econ-threat witness', () => {
  it('selects Patrol+Govern over Train+Govern when the frontier includes an Econ LoC patrol target', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const result = proposeArvnPlan(fixture, ['train', 'patrol']);
    const selected = requireSelectedTemplate(result, 'arvn.patrolGovern');
    const trainGovern = requireAlternative(result, 'arvn.trainGovern');
    const patrol = selected.roleBindings.patrolSpace;
    const passed = patrol?.selectedId === 'loc-saigon-can-tho:none'
      && patrol.components.econProtection === 2
      && selected.score > trainGovern.score;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-evolved',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.equal(patrol?.selectedId, 'loc-saigon-can-tho:none');
    assert.equal(patrol.components.econProtection, 2);
    assert.ok(selected.score > trainGovern.score);
  });
});
