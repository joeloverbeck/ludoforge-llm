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
  withZoneSupportMarkers,
} from './arvn-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_007_01;

describe('Spec 188 ARVN Govern active-support priority witness', () => {
  it('selects the high-pop Active Support Govern role target ahead of low-pop Passive Support alternatives', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const state = withZoneSupportMarkers(fixture.state, {
      'saigon:none': 'activeSupport',
      'can-tho:none': 'passiveSupport',
      'qui-nhon:none': 'passiveSupport',
    });

    const result = proposeArvnPlan(fixture, ['train'], state);
    const selected = requireSelectedTemplate(result, 'arvn.trainGovern');
    const govern = selected.roleBindings.governSpace;
    const passed = govern?.selectedId === 'saigon:none'
      && govern.components.activeSupportGovern === 1
      && govern.components.passiveSupportGovern === 0
      && govern.components.governPopulation === 6;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-evolved',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.equal(govern?.selectedId, 'saigon:none');
    assert.equal(govern.components.activeSupportGovern, 1);
    assert.equal(govern.components.passiveSupportGovern, 0);
    assert.equal(govern.components.governPopulation, 6);
  });
});
