// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { commitPlanExecutionState, type PlanExecutionStateStore } from '../../src/agents/plan-execution.js';
import {
  asActionId,
  asDecisionFrameId,
  asSeatId,
  asTurnId,
  createRng,
  initialState,
  type AgentMicroturnDecisionInput,
  type AgentPolicyCatalog,
  type CompiledAgentProfile,
  type CompiledPlanTemplate,
  type Decision,
  type GameDef,
  type MicroturnState,
} from '../../src/kernel/index.js';
import { availabilityForPlanRoot } from '../../src/agents/plan-proposal-compound-availability.js';
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

const template = (): CompiledPlanTemplate => ({
  traceLabel: 'branch-special',
  root: {
    actionTags: ['train'],
    actionIds: [],
    compound: { specialTags: ['special-activity'], timing: 'after' },
  },
  roles: {},
  steps: [{
    label: 'choose-special-space',
    role: 'space',
    match: {
      decisionKind: 'chooseOne',
      targetKind: 'zone',
      decisionPath: '$specialSpace',
      actionTag: 'special-activity',
    },
  }],
  caps: { capClass: 'standard256', maxSteps: 1 },
  fallback: {},
  dependencies: emptyDependencies,
});

const catalog = (): AgentPolicyCatalog => {
  const profile: CompiledAgentProfile = {
    fingerprint: 'compound-correspondence-profile',
    params: {},
    use: { considerations: [], strategyModules: [], tieBreakers: [] },
    preview: { mode: 'disabled' },
    selection: { mode: 'argmax' },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      planTemplates: ['branchSpecial'],
      considerations: [],
    },
  };
  return {
    schemaVersion: 3,
    catalogFingerprint: 'compound-correspondence-catalog',
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
      planTemplates: { branchSpecial: template() },
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

const def = (): GameDef => {
  const base = createSyntheticDecisionDef();
  return {
    ...base,
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    actions: [
      { ...base.actions[0]!, tags: ['train'] },
      {
        id: asActionId('special'),
        actor: 'active',
        executor: 'actor',
        phase: base.turnStructure.phases.map((phase) => phase.id),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
        tags: ['special-activity'],
      },
    ],
    actionTagIndex: {
      byAction: { branch: ['train'], special: ['special-activity'] },
      byTag: { train: ['branch'], 'special-activity': ['special'] },
    },
    actionPipelines: [
      ...(base.actionPipelines ?? []),
      {
        id: 'special-profile',
        actionId: asActionId('special'),
        accompanyingOps: ['branch'],
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ effects: [] }],
        atomicity: 'partial',
      },
    ],
    agents: catalog(),
  };
};

const rootDecision = (): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId('branch'),
  move: { actionId: asActionId('branch'), params: {} },
});

const inputFor = (agent: PolicyAgent, options: {
  readonly def: GameDef;
  readonly legalSpecialValues: readonly string[];
}): AgentMicroturnDecisionInput => {
  const state = initialState(options.def, 199, 2).state;
  commitPlanExecutionState((agent as unknown as PolicyAgentPlanProbe).planExecutionState, {
    selectedTemplate: 'branchSpecial',
    intent: 'branchSpecial',
    roleBindings: {
      space: {
        role: 'space',
        selectedId: 'right',
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
  const legalActions = options.legalSpecialValues.map((value) => ({
    kind: 'chooseOne' as const,
    decisionKey: '$specialSpace' as DecisionKey,
    value,
  }));
  const microturn: MicroturnState = {
    kind: 'chooseOne',
    seatId: asSeatId('alpha'),
    decisionContext: {
      kind: 'chooseOne',
      seatId: asSeatId('alpha'),
      decisionKey: '$specialSpace' as DecisionKey,
      targetKinds: ['zone'],
      options: options.legalSpecialValues.map((value) => ({ value, legality: 'legal', illegalReason: null })),
    },
    legalActions,
    projectedState: { state },
    turnId: asTurnId(1),
    frameId: asDecisionFrameId(1),
    compoundTurnTrace: [],
  };
  return { def: options.def, state, microturn, rng: createRng(199n) };
};

describe('compound availability and controller fallback correspondence', () => {
  it('has no false ready case for a matching next special-activity frontier', () => {
    const gameDef = def();
    const state = initialState(gameDef, 199, 2).state;
    const availability = availabilityForPlanRoot(
      { def: gameDef, state, seatId: asSeatId('alpha') },
      rootDecision(),
      { specialTags: ['special-activity'], timing: 'after' },
    );
    assert.deepEqual(availability, { kind: 'ready' });

    const agent = new PolicyAgent({ traceLevel: 'summary' });
    const result = agent.chooseDecision(inputFor(agent, { def: gameDef, legalSpecialValues: ['left', 'right'] }));

    assert.equal(result.agentDecision?.plan?.microturns?.[0]?.match, 'exact');
    assert.equal(result.decision.kind, 'chooseOne');
    assert.equal(result.decision.value, 'right');
  });

  it('predicts fallback when no grant predicate exists for the selected compound tag', () => {
    const gameDef = def();
    const state = initialState(gameDef, 199, 2).state;
    const availability = availabilityForPlanRoot(
      { def: gameDef, state, seatId: asSeatId('alpha') },
      rootDecision(),
      { specialTags: ['missing-special'], timing: 'after' },
    );
    assert.deepEqual(availability, { kind: 'unavailable', reason: 'no-grant-predicate' });

    const agent = new PolicyAgent({ traceLevel: 'summary' });
    const result = agent.chooseDecision(inputFor(agent, { def: gameDef, legalSpecialValues: ['left'] }));

    assert.equal(result.agentDecision?.plan?.microturns?.[0]?.match, 'fallback');
    assert.equal(result.agentDecision?.plan?.microturns?.[0]?.fallbackReason, 'stableFrontierTieBreak');
  });
});
