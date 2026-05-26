// @test-class: convergence-witness
// @profile-variant: arvn-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { GameState, Token } from '../../src/kernel/index.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  loadArvnPlanFixture,
  proposeArvnPlan,
} from './arvn-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const WITNESS_SEED = 197_003;
const AVAILABLE_ARVN_ZONE = 'available-ARVN:none';
const CONTROL_LIFT_ZONE = 'pleiku-darlac:none';

function moveAvailableArvnPoliceToControlLiftZone(state: GameState): GameState {
  const token = state.zones[AVAILABLE_ARVN_ZONE]?.find((entry) => entry.props.faction === 'ARVN' && entry.props.type === 'police');
  assert.ok(token, 'expected an available ARVN police token for the control-lift fixture');
  return {
    ...state,
    zones: {
      ...state.zones,
      [AVAILABLE_ARVN_ZONE]: state.zones[AVAILABLE_ARVN_ZONE]!.filter((entry) => entry.id !== token.id),
      [CONTROL_LIFT_ZONE]: [...(state.zones[CONTROL_LIFT_ZONE] ?? []), token] satisfies readonly Token[],
    },
  };
}

describe('FITL buildPoliticalEngine doctrine gating witness', () => {
  it('filters aggressive ARVN templates when buildPoliticalEngine is active', () => {
    const fixture = loadArvnPlanFixture(WITNESS_SEED);
    const state = moveAvailableArvnPoliceToControlLiftZone(fixture.state);
    const result = proposeArvnPlan(fixture, ['train', 'patrol', 'assault'], state);
    const passed = result.activeDoctrines.includes('buildPoliticalEngine')
      && result.filteredOutTemplates.some((entry) =>
        entry.templateId === 'arvn.assaultRaid'
        && entry.reason === 'suppressed'
        && entry.gatedBy.length === 1
        && entry.gatedBy[0] === 'buildPoliticalEngine')
      && result.alternatives.some((entry) => entry.templateId === 'arvn.trainGovern')
      && result.alternatives.some((entry) => entry.templateId === 'arvn.patrolGovern')
      && result.filteredOutTemplates.some((entry) =>
        entry.templateId === 'arvn.trainTransport'
        && entry.reason === 'notEnabled'
        && entry.gatedBy.includes('buildPoliticalEngine'));

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: WITNESS_SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.equal(result.status, 'selected');
    assert.ok(result.activeDoctrines.includes('buildPoliticalEngine'));
    assert.deepEqual(
      result.filteredOutTemplates.find((entry) => entry.templateId === 'arvn.assaultRaid'),
      { templateId: 'arvn.assaultRaid', gatedBy: ['buildPoliticalEngine'], reason: 'suppressed' },
    );
    assert.ok(result.alternatives.some((entry) => entry.templateId === 'arvn.trainGovern'));
    assert.ok(result.alternatives.some((entry) => entry.templateId === 'arvn.patrolGovern'));
    assert.deepEqual(
      result.filteredOutTemplates.find((entry) => entry.templateId === 'arvn.trainTransport'),
      { templateId: 'arvn.trainTransport', gatedBy: ['buildPoliticalEngine'], reason: 'notEnabled' },
    );
  });

  it('does not filter assaultRaid when buildPoliticalEngine is inactive', () => {
    const fixture = loadArvnPlanFixture(WITNESS_SEED);
    const result = proposeArvnPlan(fixture, ['train', 'patrol', 'assault']);
    const passed = !result.activeDoctrines.includes('buildPoliticalEngine')
      && !result.filteredOutTemplates.some((entry) => entry.templateId === 'arvn.assaultRaid');

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: WITNESS_SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.equal(result.status, 'selected');
    assert.equal(result.activeDoctrines.includes('buildPoliticalEngine'), false);
    assert.equal(result.filteredOutTemplates.some((entry) => entry.templateId === 'arvn.assaultRaid'), false);
    assert.ok(result.alternatives.some((entry) => entry.templateId === 'arvn.assaultRaid'));
  });
});
