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
} from './arvn-plan-witness-helpers.js';
import { withCoupLookahead } from './shared-competence-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);

describe('Spec 186 ARVN Train+Govern plan separation', () => {
  it('executes published Train+Govern with distinct plan roles and increased Patronage', () => {
    const fixture = loadArvnPlanFixture(186007);
    const plan = proposeArvnCompoundPlan(fixture, [{ actionId: 'train', specialActionId: 'govern' }]);
    const selected = requireSelectedTemplate(plan, 'arvn.trainGovern');
    const result = executePublishedArvnCompoundRoot(fixture, {
      actionId: 'train',
      specialActionId: 'govern',
      seed: 186007,
      prepareState: (def, state) => ({
        ...withCoupLookahead(def, state),
        globalMarkers: {
          ...state.globalMarkers,
          activeLeader: 'youngTurks',
        },
      }),
    });

    const trainSpace = selected.roleBindings.trainSpace?.selectedId;
    const governSpace = selected.roleBindings.governSpace?.selectedId;
    const patronageDelta = Number(result.postState.globalVars.patronage) - Number(result.preState.globalVars.patronage);
    const supportDestruction = Object.entries(result.preState.markers).filter(([zoneId, markers]) =>
      markers.supportOpposition !== result.postState.markers[zoneId]?.supportOpposition).length;
    const passed = plan.status === 'selected'
      && trainSpace !== undefined
      && governSpace !== undefined
      && trainSpace !== governSpace
      && patronageDelta > 0
      && supportDestruction <= 3;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: 186007,
      passed,
      stopReason: result.rootStableMoveKey,
      decisions: result.decisions.length,
    });

    assert.notEqual(trainSpace, undefined);
    assert.notEqual(governSpace, undefined);
    assert.notEqual(trainSpace, governSpace);
    assert.ok(patronageDelta > 0, `expected Patronage to increase, got ${patronageDelta}`);
    assert.ok(supportDestruction <= 3, `expected bounded Support destruction, got ${supportDestruction}`);
  });
});
