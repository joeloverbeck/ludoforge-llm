// @test-class: convergence-witness
// @profile-variant: arvn-baseline
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  executePublishedArvnCompoundRoot,
  loadArvnPlanFixture,
  proposeArvnCompoundPlan,
  requireSelectedTemplate,
  withEveryZoneSupportMarker,
  withZoneSupportMarkers,
} from './arvn-plan-witness-helpers.js';
import { withCoupLookahead } from './shared-competence-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_007_01;

describe('Spec 188 ARVN Govern active-support priority witness', () => {
  it('selects an Active Support Govern role target ahead of low-pop Passive Support alternatives', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const neutralState = withEveryZoneSupportMarker(fixture.def, fixture.state, 'neutral');
    const state = withZoneSupportMarkers(neutralState, {
      'can-tho:none': 'activeSupport',
      'qui-nhon:none': 'passiveSupport',
    });

    const result = proposeArvnCompoundPlan(fixture, [{ actionId: 'train', specialActionId: 'govern' }], state);
    const selected = requireSelectedTemplate(result, 'arvn.trainGovern');
    const executed = executePublishedArvnCompoundRoot(fixture, {
      actionId: 'train',
      specialActionId: 'govern',
      seed: SEED,
      prepareState: (def) => ({
        ...withCoupLookahead(def, state),
        globalMarkers: { ...state.globalMarkers, activeLeader: 'youngTurks' },
      }),
    });
    const govern = selected.roleBindings.governSpace;
    const patronageDelta = Number(executed.postState.globalVars.patronage) - Number(executed.preState.globalVars.patronage);
    const passed = govern?.selectedId === 'can-tho:none'
      && govern.components.activeSupportGovern === 1
      && govern.components.passiveSupportGovern === 0
      && govern.components.governPopulation === 1
      && govern.components.arvnCubesExceedUsCubes === 1
      && patronageDelta > 0;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length + executed.decisions.length,
    });

    assert.equal(govern?.selectedId, 'can-tho:none');
    assert.equal(govern.components.activeSupportGovern, 1);
    assert.equal(govern.components.passiveSupportGovern, 0);
    assert.equal(govern.components.governPopulation, 1);
    assert.equal(govern.components.arvnCubesExceedUsCubes, 1);
    assert.ok(patronageDelta > 0);
  });
});
