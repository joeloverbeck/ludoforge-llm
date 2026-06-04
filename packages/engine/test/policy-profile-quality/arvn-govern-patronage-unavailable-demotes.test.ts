// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { GameState, Token } from '../../src/kernel/index.js';
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
const SEED = 205_004_01;
const PATRONAGE_AVAILABLE_ZONE = 'can-tho:none';

function withPatronageUnavailableAtGovernTarget(state: GameState): GameState {
  const usTroops = state.zones['available-US:none']?.filter((entry) =>
    entry.props.faction === 'US' && entry.props.type === 'troops').slice(0, 5) ?? [];
  assert.equal(usTroops.length, 5, 'expected enough available US troops to make Patronage unavailable in the comparison zone');
  return {
    ...state,
    zones: {
      ...state.zones,
      'available-US:none': state.zones['available-US:none']!.filter((entry) =>
        !usTroops.some((token) => token.id === entry.id)),
      [PATRONAGE_AVAILABLE_ZONE]: [
        ...(state.zones[PATRONAGE_AVAILABLE_ZONE] ?? []),
        ...usTroops,
      ] satisfies readonly Token[],
    },
  };
}

describe('Spec 205 ARVN Govern Patronage availability witness', () => {
  it('scores otherwise equal Govern targets lower when Patronage mode is unavailable', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const neutralState = withEveryZoneSupportMarker(fixture.def, fixture.state, 'neutral');
    const supportState = withZoneSupportMarkers(neutralState, {
      [PATRONAGE_AVAILABLE_ZONE]: 'activeSupport',
    });
    const availableResult = proposeArvnCompoundPlan(fixture, [{ actionId: 'train', specialActionId: 'govern' }], supportState);
    const availableGovern = requireSelectedTemplate(availableResult, 'arvn.trainGovern').roleBindings.governSpace;
    const executed = executePublishedArvnCompoundRoot(fixture, {
      actionId: 'train',
      specialActionId: 'govern',
      seed: SEED,
      prepareState: (def) => ({
        ...withCoupLookahead(def, supportState),
        globalMarkers: { ...supportState.globalMarkers, activeLeader: 'youngTurks' },
      }),
    });

    const unavailableState = withPatronageUnavailableAtGovernTarget(supportState);
    const unavailableResult = proposeArvnCompoundPlan(fixture, [{ actionId: 'train', specialActionId: 'govern' }], unavailableState);
    const unavailableGovern = requireSelectedTemplate(unavailableResult, 'arvn.trainGovern').roleBindings.governSpace;
    const patronageDelta = Number(executed.postState.globalVars.patronage) - Number(executed.preState.globalVars.patronage);

    const passed = availableGovern?.selectedId === PATRONAGE_AVAILABLE_ZONE
      && unavailableGovern?.selectedId === PATRONAGE_AVAILABLE_ZONE
      && availableGovern.components.arvnCubesExceedUsCubes === 1
      && unavailableGovern.components.arvnCubesExceedUsCubes === 0
      && availableGovern.quality > unavailableGovern.quality
      && patronageDelta > 0;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: SEED,
      passed,
      stopReason: unavailableResult.status,
      decisions: availableResult.alternatives.length + unavailableResult.alternatives.length + executed.decisions.length,
    });

    assert.equal(availableGovern?.selectedId, PATRONAGE_AVAILABLE_ZONE);
    assert.equal(unavailableGovern?.selectedId, PATRONAGE_AVAILABLE_ZONE);
    assert.equal(availableGovern.components.arvnCubesExceedUsCubes, 1);
    assert.equal(unavailableGovern.components.arvnCubesExceedUsCubes, 0);
    assert.ok(availableGovern.quality > unavailableGovern.quality);
    assert.ok(patronageDelta > 0);
  });
});
