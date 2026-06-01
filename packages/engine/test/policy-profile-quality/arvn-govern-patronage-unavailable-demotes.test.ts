// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { GameState, Token } from '../../src/kernel/index.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  loadArvnPlanFixture,
  proposeArvnPlan,
  requireSelectedTemplate,
  withEveryZoneSupportMarker,
  withZoneSupportMarkers,
} from './arvn-plan-witness-helpers.js';

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
    const availableResult = proposeArvnPlan(fixture, ['train'], supportState);
    const availableGovern = requireSelectedTemplate(availableResult, 'arvn.trainGovern').roleBindings.governSpace;

    const unavailableState = withPatronageUnavailableAtGovernTarget(supportState);
    const unavailableResult = proposeArvnPlan(fixture, ['train'], unavailableState);
    const unavailableGovern = requireSelectedTemplate(unavailableResult, 'arvn.trainGovern').roleBindings.governSpace;

    const passed = availableGovern?.selectedId === PATRONAGE_AVAILABLE_ZONE
      && unavailableGovern?.selectedId === PATRONAGE_AVAILABLE_ZONE
      && availableGovern.components.arvnCubesExceedUsCubes === 1
      && unavailableGovern.components.arvnCubesExceedUsCubes === 0
      && availableGovern.quality > unavailableGovern.quality;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: SEED,
      passed,
      stopReason: unavailableResult.status,
      decisions: availableResult.alternatives.length + unavailableResult.alternatives.length,
    });

    assert.equal(availableGovern?.selectedId, PATRONAGE_AVAILABLE_ZONE);
    assert.equal(unavailableGovern?.selectedId, PATRONAGE_AVAILABLE_ZONE);
    assert.equal(availableGovern.components.arvnCubesExceedUsCubes, 1);
    assert.equal(unavailableGovern.components.arvnCubesExceedUsCubes, 0);
    assert.ok(availableGovern.quality > unavailableGovern.quality);
  });
});
