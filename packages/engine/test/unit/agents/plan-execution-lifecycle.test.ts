// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/index.js';
import {
  beginPlanExecutionTurn,
  deserializePlanExecutionState,
  planExecutionKey,
  serializePlanExecutionState,
  updatePlanExecutionLifecycle,
  type PlanExecutionState,
  type PlanExecutionStateStore,
} from '../../../src/agents/plan-execution.js';
import {
  asActionId,
  asDecisionFrameId,
  asSeatId,
  asTurnId,
  createRng,
  initialState,
  type AgentMicroturnDecisionInput,
} from '../../../src/kernel/index.js';
import type { DecisionKey } from '../../../src/kernel/decision-scope.js';
import type { MicroturnState } from '../../../src/kernel/microturn/types.js';
import { createSyntheticDecisionDef } from '../../helpers/synthetic-decision-fixture.js';

interface PolicyAgentPlanLifecycleProbe {
  readonly planExecutionState: PlanExecutionStateStore;
}

const probe = (agent: PolicyAgent): PolicyAgentPlanLifecycleProbe =>
  agent as unknown as PolicyAgentPlanLifecycleProbe;

const createInput = (microturn: MicroturnState): AgentMicroturnDecisionInput => {
  const def = createSyntheticDecisionDef();
  const state = initialState(def, 186, 2).state;
  return { def, state, microturn, rng: createRng(186n) };
};

const createActionSelectionMicroturn = (turnId: number, seatId = '0'): MicroturnState => {
  const input = createInput({} as MicroturnState);
  return {
    kind: 'actionSelection',
    seatId: asSeatId(seatId),
    decisionContext: {
      kind: 'actionSelection',
      seatId: asSeatId(seatId),
      eligibleActions: [asActionId('branch')],
    },
    legalActions: [{ kind: 'actionSelection', actionId: asActionId('branch'), move: { actionId: asActionId('branch'), params: {} } }],
    projectedState: { state: input.state },
    turnId: asTurnId(turnId),
    frameId: asDecisionFrameId(turnId * 10 + Number(seatId)),
    compoundTurnTrace: [],
  };
};

const createChooseOneMicroturn = (turnId: number, seatId = '0'): MicroturnState => {
  const input = createInput({} as MicroturnState);
  return {
    kind: 'chooseOne',
    seatId: asSeatId(seatId),
    decisionContext: {
      kind: 'chooseOne',
      seatId: asSeatId(seatId),
      decisionKey: 'decision:$pick' as DecisionKey,
      options: [],
    },
    legalActions: [],
    projectedState: { state: input.state },
    turnId: asTurnId(turnId),
    frameId: asDecisionFrameId(turnId * 10 + Number(seatId)),
    compoundTurnTrace: [],
  };
};

const createTurnRetirementMicroturn = (turnId: number): MicroturnState => {
  const input = createInput({} as MicroturnState);
  return {
    kind: 'turnRetirement',
    seatId: '__kernel',
    decisionContext: {
      kind: 'turnRetirement',
      seatId: '__kernel',
      retiringTurnId: asTurnId(turnId),
    },
    legalActions: [{ kind: 'turnRetirement', retiringTurnId: asTurnId(turnId) }],
    projectedState: { state: input.state },
    turnId: asTurnId(turnId),
    frameId: asDecisionFrameId(turnId * 10),
    compoundTurnTrace: [],
  };
};

describe('plan execution lifecycle', () => {
  it('creates state at actionSelection and preserves it across same-turn microturns', () => {
    const agent = new PolicyAgent();
    const agentProbe = probe(agent);

    updatePlanExecutionLifecycle(agentProbe.planExecutionState, createInput(createActionSelectionMicroturn(7)));
    const key = planExecutionKey(asTurnId(7), asSeatId('0'));
    const initial = agentProbe.planExecutionState.get(key);
    assert.notEqual(initial, undefined);
    assert.equal(initial?.selectedTemplate, null);
    assert.equal(initial?.nextStepIndex, 0);

    updatePlanExecutionLifecycle(agentProbe.planExecutionState, createInput(createChooseOneMicroturn(7)));
    assert.equal(agentProbe.planExecutionState.get(key), initial);
  });

  it('clears state on turnRetirement and same-seat turn changes', () => {
    const agent = new PolicyAgent();
    const agentProbe = probe(agent);

    updatePlanExecutionLifecycle(agentProbe.planExecutionState, createInput(createActionSelectionMicroturn(10)));
    assert.equal(agentProbe.planExecutionState.has(planExecutionKey(asTurnId(10), asSeatId('0'))), true);

    updatePlanExecutionLifecycle(agentProbe.planExecutionState, createInput(createTurnRetirementMicroturn(10)));
    assert.equal(agentProbe.planExecutionState.has(planExecutionKey(asTurnId(10), asSeatId('0'))), false);

    updatePlanExecutionLifecycle(agentProbe.planExecutionState, createInput(createActionSelectionMicroturn(11, '1')));
    assert.equal(agentProbe.planExecutionState.has(planExecutionKey(asTurnId(11), asSeatId('1'))), true);

    updatePlanExecutionLifecycle(agentProbe.planExecutionState, createInput(createChooseOneMicroturn(12, '1')));
    assert.equal(agentProbe.planExecutionState.has(planExecutionKey(asTurnId(11), asSeatId('1'))), false);
  });

  it('round-trips serialization canonically', () => {
    const store: PlanExecutionStateStore = new Map();
    const empty = beginPlanExecutionTurn(store, asTurnId(21), asSeatId('0'));
    assert.equal(serializePlanExecutionState(deserializePlanExecutionState(serializePlanExecutionState(empty))), serializePlanExecutionState(empty));

    const populated: PlanExecutionState = {
      selectedTemplate: 'trainGovern',
      intent: 'arvn.trainGovern',
      roleBindings: {
        governSpace: {
          role: 'governSpace',
          selectedId: 'saigon',
          quality: 3,
          rank: 1,
          components: { support: 2, patronage: 1 },
        },
        trainSpace: {
          role: 'trainSpace',
          selectedId: 'hue',
          quality: 5,
          rank: 0,
          components: { control: 3, population: 2 },
        },
      },
      nextStepIndex: 1,
      fallbackHistory: ['reselectRole'],
      deviations: ['governSpace.reselected'],
      turnId: '21',
      seatId: '0',
    };
    const serialized = serializePlanExecutionState(populated);
    const reparsed = serializePlanExecutionState(deserializePlanExecutionState(serialized));
    assert.equal(reparsed, serialized);
  });
});
