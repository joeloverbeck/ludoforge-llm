// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectPlanControlledDecision } from '../../src/agents/plan-controller.js';
import { commitPlanExecutionState, type PlanExecutionStateStore } from '../../src/agents/plan-execution.js';
import {
  asSeatId,
  initialState,
  type AgentPolicyCatalog,
  type CompiledAgentProfile,
  type CompiledPlanTemplate,
  type Decision,
  type DecisionContext,
  type GameDef,
} from '../../src/kernel/index.js';
import type { PlanMicroturnFallbackReason, PolicyPlanMicroturnTrace } from '../../src/kernel/types-plan-trace.js';
import type { DecisionKey } from '../../src/kernel/decision-scope.js';
import { createSyntheticDecisionDef } from '../helpers/synthetic-decision-fixture.js';

const allowedKinds = new Set<PlanMicroturnFallbackReason['kind']>([
  'noExactRoleValueMatch',
  'reselectedWithinRole',
  'primitiveConsiderationPolicyFallback',
  'stableFrontierTieBreakFallback',
  'hiddenStatePrecludedMatch',
  'partialObserverScope',
  'depthCapped',
]);

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
    fingerprint: 'fallback-reason-union-profile',
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
    catalogFingerprint: 'fallback-reason-union-catalog',
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

const decision = (value: string): Extract<Decision, { readonly kind: 'chooseOne' }> => ({
  kind: 'chooseOne',
  decisionKey: '$space' as DecisionKey,
  value,
});

const context = (override: Partial<DecisionContext> = {}): DecisionContext => ({
  kind: 'chooseOne',
  seatId: asSeatId('alpha'),
  decisionKey: '$space' as DecisionKey,
  targetKinds: ['zone'],
  stageIndex: 1,
  options: [
    { value: 'left', legality: 'legal', illegalReason: null },
    { value: 'right', legality: 'legal', illegalReason: null },
  ],
  ...override,
} as DecisionContext);

const traceFor = (options: {
  readonly selectedId: string;
  readonly legalActions: readonly Decision[];
  readonly decisionContext?: DecisionContext;
  readonly primitiveDecision?: Decision;
}): PolicyPlanMicroturnTrace => {
  const gameDef: GameDef = { ...createSyntheticDecisionDef(), seats: [{ id: 'alpha' }, { id: 'beta' }], agents: catalog() };
  const state = initialState(gameDef, 200, 2).state;
  const store: PlanExecutionStateStore = new Map();
  commitPlanExecutionState(store, {
    selectedTemplate: 'chooseSpace',
    intent: 'chooseSpace',
    roleBindings: {
      space: {
        role: 'space',
        selectedId: options.selectedId,
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
  const result = selectPlanControlledDecision({
    def: gameDef,
    catalog: gameDef.agents!,
    store,
    turnId: '1',
    seatId: 'alpha',
    legalActions: options.legalActions,
    decisionContext: options.decisionContext ?? context(),
    ...(options.primitiveDecision === undefined ? {} : { primitiveDecision: options.primitiveDecision }),
  });
  const trace = result?.planTrace.microturns?.[0];
  assert.ok(trace, 'expected plan controller to emit a microturn trace');
  void state;
  return trace;
};

describe('plan trace fallback reason union closure', () => {
  it('emits only declared fallbackReason union kinds on controller microturn traces', () => {
    const primitiveFallback = decision('left');
    const traces = [
      traceFor({ selectedId: 'right', legalActions: [decision('right')] }),
      traceFor({ selectedId: 'right', legalActions: [decision('left')] }),
      traceFor({
        selectedId: 'right',
        legalActions: [primitiveFallback],
        primitiveDecision: primitiveFallback,
        decisionContext: context({ decisionKey: '$otherSpace' as DecisionKey }),
      }),
      traceFor({
        selectedId: 'right',
        legalActions: [decision('left')],
        decisionContext: context({ decisionKey: '$otherSpace' as DecisionKey }),
      }),
    ];

    for (const trace of traces) {
      if (trace.fallbackReason === undefined) {
        continue;
      }
      assert.equal(typeof trace.fallbackReason, 'object');
      assert.equal(allowedKinds.has(trace.fallbackReason.kind), true);
    }
    assert.deepEqual(traces.map((trace) => trace.fallbackReason), [
      undefined,
      { kind: 'stableFrontierTieBreakFallback' },
      { kind: 'primitiveConsiderationPolicyFallback' },
      { kind: 'stableFrontierTieBreakFallback' },
    ]);
  });
});
