// @test-class: convergence-witness
// @profile-variant: arvn-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { selectPlanControlledDecision } from '../../src/agents/plan-controller.js';
import { commitPlanExecutionState, type PlanExecutionStateStore } from '../../src/agents/plan-execution.js';
import {
  assertValidatedGameDef,
  initialState,
  type Decision,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const FITL_PLAYER_COUNT = 4;

const chooseZone = (decisionKey: string, value: string): Extract<Decision, { readonly kind: 'chooseNStep' }> => ({
  kind: 'chooseNStep',
  decisionKey: decisionKey as never,
  command: 'add',
  value,
});

describe('Spec 186 ARVN Train+Govern fallback', () => {
  it('falls back to a published legal decision when the planned Govern role target is unavailable', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assertNoErrors(compiled);

    const def = assertValidatedGameDef(compiled.gameDef);
    const state = initialState(def, 186008, FITL_PLAYER_COUNT).state;
    const template = def.agents?.library.planTemplates?.['arvn.trainGovern'];
    assert.ok(template, 'expected arvn.trainGovern template');

    const zoneIds = Object.keys(state.zones).sort();
    const legalZone = zoneIds[0];
    const plannedUnavailableZone = zoneIds[1];
    assert.notEqual(legalZone, undefined);
    assert.notEqual(plannedUnavailableZone, undefined);
    assert.notEqual(legalZone, plannedUnavailableZone);

    const legalDecision = chooseZone('govern-target', legalZone!);
    const store: PlanExecutionStateStore = new Map();
    commitPlanExecutionState(store, {
      selectedTemplate: 'arvn.trainGovern',
      intent: 'arvn.trainGovern',
      roleBindings: {
        trainSpace: {
          role: 'trainSpace',
          selectedId: zoneIds[2] ?? legalZone!,
          quality: 1,
          rank: 1,
          components: { controlOrPacificationOpportunity: 1 },
        },
        governSpace: {
          role: 'governSpace',
          selectedId: plannedUnavailableZone!,
          quality: 1,
          rank: 2,
          components: { patronageOpportunity: 1 },
        },
      },
      nextStepIndex: 1,
      fallbackHistory: [],
      deviations: [],
      turnId: '186008',
      seatId: 'arvn',
    });

    const controlled = selectPlanControlledDecision({
      def,
      catalog: def.agents!,
      store,
      turnId: '186008',
      seatId: 'arvn',
      legalActions: [legalDecision],
      primitiveDecision: legalDecision,
    });
    const microturnTrace = controlled?.planTrace.microturns?.[0];

    const passed = controlled?.decision === legalDecision
      && microturnTrace?.match === 'fallback'
      && microturnTrace?.fallbackReason === 'primitiveConsiderationPolicy';

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: 186008,
      passed,
      stopReason: microturnTrace?.match ?? 'no-plan-decision',
      decisions: 1,
    });

    assert.ok(controlled, 'expected plan controller to select a legal decision');
    assert.ok(microturnTrace, 'expected plan controller to emit a microturn trace');
    assert.equal(controlled?.decision, legalDecision);
    assert.equal(microturnTrace.match, 'fallback');
    assert.equal(microturnTrace.fallbackReason, 'primitiveConsiderationPolicy');
    assert.equal([legalDecision].includes(controlled.decision), true);
  });
});
