// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PLAN_CAP_CLASS_BUDGETS,
  proposeAdvisoryTurnPlan,
} from '../../../src/agents/plan-proposal.js';
import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import { planExecutionKey, serializePlanExecutionState, type PlanExecutionStateStore } from '../../../src/agents/plan-execution.js';
import {
  asActionId,
  asDecisionFrameId,
  asPhaseId,
  asPlayerId,
  asSeatId,
  asTurnId,
  createRng,
  initialState,
  type AgentMicroturnDecisionInput,
  type AgentPolicyCatalog,
  type CompiledPolicySelector,
  type CompiledAgentProfile,
  type CompiledPlanTemplate,
  type Decision,
  type GameDef,
  type MicroturnState,
  type StrategyModuleDef,
} from '../../../src/kernel/index.js';
import { createSyntheticDecisionDef } from '../../helpers/synthetic-decision-fixture.js';

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

const literal = (value: string | number | boolean) => ({ kind: 'literal' as const, value });

const planTemplate = (overrides: Partial<CompiledPlanTemplate> = {}): CompiledPlanTemplate => ({
  traceLabel: 'train-govern',
  root: { actionTags: ['train'], actionIds: [] },
  roles: {
    trainSpace: {
      selectorId: 'trainSpaceSelector' as never,
      required: true,
      constraints: [],
      selector: {
        selectorId: 'trainSpaceSelector' as never,
        role: 'trainSpace',
        scopes: ['move'],
        source: { kind: 'collection', collection: { kind: 'players' } },
        result: { maxItems: 1, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
        costClass: 'state',
        dependencies: emptyDependencies,
        refs: {
          id: 'role.trainSpace.id',
          quality: 'role.trainSpace.quality',
          rank: 'role.trainSpace.rank',
          components: 'role.trainSpace.components',
        },
      },
    },
  },
  steps: [{
    label: 'train',
    role: 'trainSpace',
    match: { decisionKind: 'actionSelection', targetKind: 'action', decisionPath: 'actionId', actionTag: 'train' },
  }],
  caps: { capClass: 'standard256', maxSteps: 1 },
  fallback: {},
  dependencies: emptyDependencies,
  ...overrides,
});

const strategyModule = (overrides: Partial<StrategyModuleDef> = {}): StrategyModuleDef => ({
  id: 'doctrine.train' as never,
  traceLabel: 'train doctrine',
  when: literal(true),
  applies: { scopes: ['move'], actionTags: ['train'] },
  priority: { tier: 10 },
  selectors: [],
  scoreGroups: [],
  guardrailIds: [],
  fallback: { ifInactive: 'noContribution', ifSelectorEmpty: 'noContribution' },
  costClass: 'state',
  dependencies: emptyDependencies,
  ...overrides,
});

const roleSelector = (): CompiledPolicySelector => ({
  id: 'trainSpaceSelector' as never,
  scopes: ['move'],
  source: { kind: 'collection', collection: { kind: 'players' } },
  quality: { components: [{ id: 'leafQuality' as never, value: literal(7), weight: 1 }], order: 'qualityDesc' },
  result: { maxItems: 1, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
  costClass: 'state',
  dependencies: emptyDependencies,
});

const createCatalog = (options: {
  readonly template?: CompiledPlanTemplate;
  readonly module?: StrategyModuleDef;
  readonly profilePlanTemplates?: readonly string[];
} = {}): AgentPolicyCatalog => {
  const template = options.template ?? planTemplate();
  const module = options.module ?? strategyModule();
  const profile: CompiledAgentProfile = {
    fingerprint: 'plan-proposal-profile',
    params: {},
    use: { considerations: [], strategyModules: ['doctrine.train'], tieBreakers: [] },
    preview: { mode: 'disabled' },
    selection: { mode: 'argmax' },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      selectors: [],
      strategyModules: ['doctrine.train'],
      planTemplates: options.profilePlanTemplates ?? ['trainGovern'],
      considerations: [],
    },
  };
  return {
    schemaVersion: 3,
    catalogFingerprint: 'plan-proposal-catalog',
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
      selectors: {
        trainSpaceSelector: {
          scopes: ['move'],
          source: { kind: 'collection', collection: { kind: 'players' } },
          result: { maxItems: 1, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
          costClass: 'state',
          dependencies: emptyDependencies,
        },
      },
      strategyModules: {
        'doctrine.train': {
          traceLabel: module.traceLabel,
          applies: module.applies,
          selectors: module.selectors,
          scoreGroups: [],
          guardrailIds: [],
          fallback: module.fallback,
          costClass: module.costClass,
          dependencies: module.dependencies,
        },
      },
      planTemplates: { trainGovern: template },
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    compiled: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      selectors: { trainSpaceSelector: roleSelector() },
      strategyModules: { 'doctrine.train': module },
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { alpha: 'baseline' },
  };
};

const createDef = (): GameDef => {
  const base = createSyntheticDecisionDef();
  return {
    ...base,
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    actionTagIndex: {
      byAction: { branch: ['train'] },
      byTag: { train: ['branch'] },
    },
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    agents: createCatalog(),
  };
};

const actionDecision = (actionId: string): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId(actionId),
  move: { actionId: asActionId(actionId), params: {} },
});

const actionSelectionInput = (def: GameDef): AgentMicroturnDecisionInput => {
  const state = initialState(def, 186, 2).state;
  const microturn: MicroturnState = {
    kind: 'actionSelection',
    seatId: asSeatId('alpha'),
    decisionContext: {
      kind: 'actionSelection',
      seatId: asSeatId('alpha'),
      eligibleActions: [asActionId('branch')],
    },
    legalActions: [actionDecision('branch')],
    projectedState: { state },
    turnId: asTurnId(1),
    frameId: asDecisionFrameId(1),
    compoundTurnTrace: [],
  };
  return { def, state, microturn, rng: createRng(186n) };
};

describe('plan proposal', () => {
  it('enumerates a matching template, binds roles, and produces a selected plan', () => {
    const def = createDef();
    const state = initialState(def, 186, 2).state;
    const profile = def.agents!.profiles.baseline!;

    const result = proposeAdvisoryTurnPlan({
      def,
      state,
      seatId: 'alpha',
      playerId: asPlayerId(0),
      profile,
      catalog: def.agents!,
      actionDecisions: [actionDecision('branch')],
    });

    assert.equal(result.status, 'selected');
    assert.equal(result.selected?.templateId, 'trainGovern');
    assert.equal(result.selected?.roleBindings.trainSpace?.selectedId, '1');
    assert.equal(result.selected?.roleBindings.trainSpace?.quality, 7);
    assert.equal(result.selected?.score, 17);
    assert.equal(result.activeDoctrines[0], 'doctrine.train');
  });

  it('truncates alternatives deterministically by named cap class', () => {
    const def = createDef();
    const state = initialState(def, 186, 2).state;
    const profile = def.agents!.profiles.baseline!;

    const result = proposeAdvisoryTurnPlan({
      def,
      state,
      seatId: 'alpha',
      playerId: asPlayerId(0),
      profile,
      catalog: def.agents!,
      actionDecisions: Array.from({ length: PLAN_CAP_CLASS_BUDGETS.standard256 + 1 }, () => actionDecision('branch')),
    });

    assert.equal(result.status, 'selected');
    assert.equal(result.alternatives.length, PLAN_CAP_CLASS_BUDGETS.standard256);
    assert.deepEqual(
      result.alternatives.map((alternative) => alternative.stableKey),
      [...result.alternatives.map((alternative) => alternative.stableKey)].sort(),
    );
  });

  it('commits the selected plan state and emits proposal trace through PolicyAgent', () => {
    const def = createDef();
    const agent = new PolicyAgent({ traceLevel: 'summary' });
    const result = agent.chooseDecision(actionSelectionInput(def));
    const store = (agent as unknown as PolicyAgentPlanProbe).planExecutionState;
    const state = store.get(planExecutionKey(asTurnId(1), asSeatId('alpha')));

    assert.equal(result.agentDecision?.plan?.status, 'selected');
    assert.equal(result.agentDecision?.plan?.selectedTemplate, 'trainGovern');
    assert.equal(state?.selectedTemplate, 'trainGovern');
    assert.match(serializePlanExecutionState(state!), /"trainSpace"/);
  });
});
