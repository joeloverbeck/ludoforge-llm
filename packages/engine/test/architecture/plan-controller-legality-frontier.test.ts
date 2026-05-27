// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { commitPlanExecutionState, type PlanExecutionStateStore } from '../../src/agents/plan-execution.js';
import {
  asDecisionFrameId,
  asSeatId,
  asTurnId,
  createRng,
  initialState,
  type AgentMicroturnDecisionInput,
  type AgentPolicyCatalog,
  type CompiledAgentProfile,
  type CompiledPlanTemplate,
  type MicroturnState,
} from '../../src/kernel/index.js';
import type { DecisionKey } from '../../src/kernel/decision-scope.js';
import { createSyntheticDecisionDef } from '../helpers/synthetic-decision-fixture.js';

interface PolicyAgentPlanProbe {
  readonly planExecutionState: PlanExecutionStateStore;
}

const emptyDependencies = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  selectors: [],
  strategyModules: [],
  strategicConditions: [],
};

const planTemplate = (): CompiledPlanTemplate => ({
  traceLabel: 'choose planned space',
  root: { actionTags: [], actionIds: ['branch'] },
  roles: {},
  steps: [{
    label: 'choose-space',
    role: 'space',
    match: { decisionKind: 'chooseOne', targetKind: 'zone', decisionPath: '$space', stageIndex: 1 },
  }],
  caps: { capClass: 'standard256', maxSteps: 1 },
  fallback: {},
  dependencies: emptyDependencies,
});

const catalog = (): AgentPolicyCatalog => {
  const profile: CompiledAgentProfile = {
    fingerprint: 'plan-controller-profile',
    params: {},
    use: { considerations: [], strategyModules: [], tieBreakers: [] },
    preview: { mode: 'disabled' },
    selection: { mode: 'argmax' },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      planTemplates: ['chooseSpace'],
      considerations: [],
    },
  };
  return {
    schemaVersion: 3,
    catalogFingerprint: 'plan-controller-catalog',
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        currentRank: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      },
      activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      selectors: {},
      strategyModules: {},
      planTemplates: { chooseSpace: planTemplate() },
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    compiled: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      selectors: {},
      strategyModules: {},
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { alpha: 'baseline' },
  };
};

const inputFor = (agent: PolicyAgent, selectedId: string): AgentMicroturnDecisionInput => {
  const def = {
    ...createSyntheticDecisionDef(),
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    agents: catalog(),
  };
  const state = initialState(def, 186, 2).state;
  commitPlanExecutionState((agent as unknown as PolicyAgentPlanProbe).planExecutionState, {
    selectedTemplate: 'chooseSpace',
    intent: 'chooseSpace',
    roleBindings: {
      space: {
        role: 'space',
        selectedId,
        quality: 1,
        rank: 0,
        components: {},
      },
    },
    nextStepIndex: 0,
    fallbackHistory: [],
    deviations: [],
    turnId: '1',
    seatId: 'alpha',
  });
  const microturn: MicroturnState = {
    kind: 'chooseOne',
    seatId: asSeatId('alpha'),
    decisionContext: {
      kind: 'chooseOne',
      seatId: asSeatId('alpha'),
      decisionKey: '$space' as DecisionKey,
      targetKinds: ['zone'],
      stageIndex: 1,
      options: [
        { value: 'left', legality: 'legal', illegalReason: null },
        { value: 'right', legality: 'legal', illegalReason: null },
      ],
    },
    legalActions: [
      { kind: 'chooseOne', decisionKey: '$space' as DecisionKey, value: 'left' },
      { kind: 'chooseOne', decisionKey: '$space' as DecisionKey, value: 'right' },
    ],
    projectedState: { state },
    turnId: asTurnId(1),
    frameId: asDecisionFrameId(1),
    compoundTurnTrace: [],
  };
  return { def, state, microturn, rng: createRng(186n) };
};

describe('plan execution controller frontier legality', () => {
  it('selects the exact planned role value from the published legal frontier', () => {
    const agent = new PolicyAgent({ traceLevel: 'summary' });
    const input = inputFor(agent, 'right');
    const result = agent.chooseDecision(input);
    const replayAgent = new PolicyAgent({ traceLevel: 'summary' });
    const replay = replayAgent.chooseDecision(inputFor(replayAgent, 'right'));

    assert.equal(result.decision.kind, 'chooseOne');
    assert.equal(result.decision.value, 'right');
    assert.ok(input.microturn.legalActions.some((decision) => JSON.stringify(decision) === JSON.stringify(result.decision)));
    assert.equal(result.agentDecision?.plan?.microturns?.[0]?.match, 'exact');
    assert.equal(result.agentDecision?.plan?.microturns?.[0]?.selectedLegalOption, 'chooseOne:$space:"right"');
    assert.equal(JSON.stringify(result.agentDecision?.plan), JSON.stringify(replay.agentDecision?.plan));
  });

  it('falls back deterministically inside the published frontier when the bound role is unavailable', () => {
    const agent = new PolicyAgent({ traceLevel: 'summary' });
    const input = inputFor(agent, 'missing');
    const result = agent.chooseDecision(input);

    assert.equal(result.decision.kind, 'chooseOne');
    assert.equal(result.decision.value, 'left');
    assert.ok(input.microturn.legalActions.some((decision) => JSON.stringify(decision) === JSON.stringify(result.decision)));
    assert.equal(result.agentDecision?.plan?.microturns?.[0]?.match, 'fallback');
    assert.deepEqual(result.agentDecision?.plan?.microturns?.[0]?.fallbackReason, {
      kind: 'stableFrontierTieBreakFallback',
    });
  });

  it('does not exact-match a planned value from the wrong decision path, target kind, or stage', () => {
    const mismatches = [
      { decisionKey: '$otherSpace' as DecisionKey },
      { targetKinds: ['token'] as const },
      { stageIndex: 2 },
    ];
    for (const mismatch of mismatches) {
      const agent = new PolicyAgent({ traceLevel: 'summary' });
      const input = inputFor(agent, 'right');
      const result = agent.chooseDecision({
        ...input,
        microturn: {
          ...input.microturn,
          decisionContext: {
            ...input.microturn.decisionContext,
            ...mismatch,
          },
        },
      });

      assert.equal(result.decision.kind, 'chooseOne');
      assert.equal(result.agentDecision?.plan?.microturns?.[0]?.match, 'fallback');
      assert.notEqual(result.agentDecision?.plan?.microturns?.[0]?.match, 'exact');
    }
  });
});
