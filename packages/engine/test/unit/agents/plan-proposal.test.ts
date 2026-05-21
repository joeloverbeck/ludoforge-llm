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
  type CompiledAgentRelationship,
  type CompiledPostureEvaluator,
  type CompiledPolicyRelationship,
  type CompiledPolicySelector,
  type CompiledAgentProfile,
  type CompiledPlanTemplate,
  type Decision,
  type GameDef,
  type MicroturnState,
  type StrategyModuleDef,
} from '../../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
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
const previewPlanMarginSelf = {
  kind: 'ref' as const,
  ref: { kind: 'previewPlanRef' as const, refKind: 'deltaVictoryCurrentMarginSelf' as const, onMissing: 'unavailable' as const },
};
const relationshipRef = (
  role: CompiledPolicyRelationship['role'],
  field: 'seat' | 'gainValue',
) => ({
  kind: 'ref' as const,
  ref: { kind: 'relationship' as const, role, field },
});

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

const postureEvaluator = (overrides: Partial<CompiledPostureEvaluator> = {}): CompiledPostureEvaluator => ({
  id: 'sustain' as never,
  traceLabel: 'sustain',
  must: [],
  prefer: [],
  costClass: 'preview',
  dependencies: emptyDependencies,
  ...overrides,
});

const roleSelector = (maxItems = 1): CompiledPolicySelector => ({
  id: 'trainSpaceSelector' as never,
  scopes: ['move'],
  source: { kind: 'collection', collection: { kind: 'players' } },
  quality: { components: [{ id: 'leafQuality' as never, value: literal(7), weight: 1 }], order: 'qualityDesc' },
  result: { maxItems, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
  costClass: 'state',
  dependencies: emptyDependencies,
});

const createCatalog = (options: {
  readonly template?: CompiledPlanTemplate;
  readonly module?: StrategyModuleDef;
  readonly profilePlanTemplates?: readonly string[];
  readonly selector?: CompiledPolicySelector;
  readonly posture?: CompiledPostureEvaluator;
  readonly relationships?: Readonly<Record<string, CompiledPolicyRelationship>>;
} = {}): AgentPolicyCatalog => {
  const template = options.template ?? planTemplate();
  const module = options.module ?? strategyModule();
  const selector = options.selector ?? roleSelector();
  const libraryRelationships: Readonly<Record<string, CompiledAgentRelationship>> | undefined = options.relationships === undefined
    ? undefined
    : Object.fromEntries(Object.entries(options.relationships).map(([id, relationship]) => [
        id,
        {
          role: relationship.role,
          ...(relationship.seat === undefined ? {} : { seat: relationship.seat }),
          ...(relationship.standingRole === undefined ? {} : { standingRole: relationship.standingRole }),
          ...(relationship.condition === undefined ? {} : { condition: relationship.condition }),
          priority: relationship.priority,
          hasGainValue: relationship.gainValue !== undefined,
        },
      ]));
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
          result: selector.result,
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
      ...(libraryRelationships === undefined ? {} : { relationships: libraryRelationships }),
      ...(options.posture === undefined ? {} : {
        postureEvaluators: {
          [String(options.posture.id)]: {
            traceLabel: options.posture.traceLabel,
            must: options.posture.must.map((entry) => ({
              id: entry.id,
              onViolation: entry.onViolation,
              hasDemotePenalty: entry.demotePenalty !== undefined,
            })),
            prefer: options.posture.prefer.map((entry) => ({
              id: entry.id,
              hasWhen: entry.when !== undefined,
              hasFallbackContribution: true,
            })),
            costClass: options.posture.costClass,
            dependencies: options.posture.dependencies,
          },
        },
      }),
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    compiled: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      selectors: { trainSpaceSelector: selector },
      strategyModules: { 'doctrine.train': module },
      ...(options.relationships === undefined ? {} : { relationships: options.relationships }),
      ...(options.posture === undefined ? {} : { postureEvaluators: { [String(options.posture.id)]: options.posture } }),
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

const actionDecisionWithRank = (rank: number): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId('branch'),
  move: { actionId: asActionId('branch'), params: { rank } },
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

  it('tries later role-selector candidates when an earlier candidate violates role constraints', () => {
    const template = planTemplate({
      roles: {
        trainSpace: planTemplate().roles.trainSpace!,
        governSpace: {
          ...planTemplate().roles.trainSpace!,
          constraints: [{ kind: 'notEqual', role: 'trainSpace' }],
        },
      },
      steps: [
        {
          label: 'train',
          role: 'trainSpace',
          match: { decisionKind: 'actionSelection', targetKind: 'action', decisionPath: 'actionId', actionTag: 'train' },
        },
        {
          label: 'govern',
          role: 'governSpace',
          match: { decisionKind: 'chooseNStep', targetKind: 'zone', decisionPath: 'targetSpaces', actionTag: 'govern' },
        },
      ],
      caps: { capClass: 'standard256', maxSteps: 2 },
    });
    const def = {
      ...createDef(),
      agents: createCatalog({ template, selector: roleSelector(2) }),
    };
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
    assert.equal(result.selected?.roleBindings.trainSpace?.selectedId, '1');
    assert.equal(result.selected?.roleBindings.governSpace?.selectedId, '2');
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

  it('adds ready posture prefer contributions to plan rank and trace', () => {
    const template = planTemplate({ postureHook: 'sustain' });
    const posture = postureEvaluator({
      prefer: [{
        id: 'margin-gain',
        value: previewPlanMarginSelf,
        weight: literal(2),
        fallback: { contribution: literal(-4) },
      }],
    });
    const def = {
      ...createDef(),
      agents: createCatalog({ template, posture }),
    };
    const state = initialState(def, 186, 2).state;
    const profile = def.agents!.profiles.baseline!;
    const low = actionDecisionWithRank(1);
    const high = actionDecisionWithRank(2);
    const lowKey = toMoveIdentityKey(def, low.move!);
    const highKey = toMoveIdentityKey(def, high.move!);

    const input: Parameters<typeof proposeAdvisoryTurnPlan>[0] = {
      def,
      state,
      seatId: 'alpha',
      playerId: asPlayerId(0),
      profile,
      catalog: def.agents!,
      actionDecisions: [low, high],
      previewPlanRefsByRootStableMoveKey: new Map([
        [lowKey, new Map([['preview.plan.delta.victory.currentMargin.self', { kind: 'ready', value: 1 }]])],
        [highKey, new Map([['preview.plan.delta.victory.currentMargin.self', { kind: 'ready', value: 4 }]])],
      ]),
    };

    const result = proposeAdvisoryTurnPlan(input);
    const replay = proposeAdvisoryTurnPlan(input);

    assert.equal(result.status, 'selected');
    assert.equal(result.selected?.rootStableMoveKey, highKey);
    assert.equal(result.posture.status, 'ready');
    assert.deepEqual(result.posture.preferContributions, [{
      id: 'margin-gain',
      status: 'ready',
      value: 4,
      weight: 2,
      contribution: 8,
    }]);
    assert.deepEqual(replay.posture, result.posture);
    assert.equal(replay.selected?.rootStableMoveKey, result.selected?.rootStableMoveKey);
  });

  it('applies declared posture fallback and records non-ready status when plan preview is absent', () => {
    const template = planTemplate({ postureHook: 'sustain' });
    const posture = postureEvaluator({
      prefer: [{
        id: 'margin-gain',
        value: previewPlanMarginSelf,
        weight: literal(2),
        fallback: { contribution: literal(-4) },
      }],
    });
    const def = {
      ...createDef(),
      agents: createCatalog({ template, posture }),
    };
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
    assert.equal(result.posture.status, 'noPreviewDecision');
    assert.deepEqual(result.posture.preferContributions, [{
      id: 'margin-gain',
      status: 'noPreviewDecision',
      contribution: -4,
      fallbackReason: 'noPreviewDecision',
    }]);
  });

  it('traces a conditional ally-weight flip when an ally is also near win', () => {
    const template = planTemplate({ postureHook: 'sustain' });
    const posture = postureEvaluator({
      prefer: [
        {
          id: 'ally-gain-base',
          value: relationshipRef('nominalAlly', 'gainValue'),
          weight: literal(1),
          fallback: { contribution: literal(0) },
        },
        {
          id: 'ally-gain-near-win-flip',
          when: {
            kind: 'op',
            op: 'eq',
            args: [
              relationshipRef('nearWin', 'seat'),
              relationshipRef('nominalAlly', 'seat'),
            ],
          },
          value: relationshipRef('nominalAlly', 'gainValue'),
          weight: literal(-2),
          fallback: { contribution: literal(0) },
        },
      ],
    });
    const def = {
      ...createDef(),
      agents: createCatalog({
        template,
        posture,
        relationships: {
          ally: { role: 'nominalAlly', seat: 'beta', priority: 0, gainValue: literal(5) },
          nearWin: { role: 'nearWin', seat: 'beta', priority: 0 },
        },
      }),
    };
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
    const replay = proposeAdvisoryTurnPlan({
      def,
      state,
      seatId: 'alpha',
      playerId: asPlayerId(0),
      profile,
      catalog: def.agents!,
      actionDecisions: [actionDecision('branch')],
    });

    assert.equal(result.status, 'selected');
    assert.equal(result.selected?.score, 12);
    assert.deepEqual(result.posture.preferContributions.map((entry) => [entry.id, entry.contribution]), [
      ['ally-gain-base', 5],
      ['ally-gain-near-win-flip', -10],
    ]);
    assert.deepEqual(result.posture.allyWeightContext, {
      activeRoles: [
        { relationshipId: 'ally', role: 'nominalAlly', seat: 'beta', priority: 0, gainValue: 5 },
        { relationshipId: 'nearWin', role: 'nearWin', seat: 'beta', priority: 0 },
      ],
      flips: [{
        contributionId: 'ally-gain-near-win-flip',
        allyRole: 'nominalAlly',
        thresholdRole: 'nearWin',
        seat: 'beta',
        fired: true,
      }],
    });
    assert.deepEqual(replay.posture, result.posture);
  });

  it('keeps base ally weight when no ally is near win', () => {
    const template = planTemplate({ postureHook: 'sustain' });
    const posture = postureEvaluator({
      prefer: [
        {
          id: 'ally-gain-base',
          value: relationshipRef('nominalAlly', 'gainValue'),
          weight: literal(1),
          fallback: { contribution: literal(0) },
        },
        {
          id: 'ally-gain-near-win-flip',
          when: {
            kind: 'op',
            op: 'eq',
            args: [
              relationshipRef('nearWin', 'seat'),
              relationshipRef('nominalAlly', 'seat'),
            ],
          },
          value: relationshipRef('nominalAlly', 'gainValue'),
          weight: literal(-2),
          fallback: { contribution: literal(0) },
        },
      ],
    });
    const def = {
      ...createDef(),
      agents: createCatalog({
        template,
        posture,
        relationships: {
          ally: { role: 'nominalAlly', seat: 'beta', priority: 0, gainValue: literal(5) },
          nearWin: { role: 'nearWin', seat: 'alpha', priority: 0 },
        },
      }),
    };
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
    assert.equal(result.selected?.score, 22);
    assert.deepEqual(result.posture.preferContributions.map((entry) => [entry.id, entry.contribution]), [
      ['ally-gain-base', 5],
    ]);
    assert.deepEqual(result.posture.allyWeightContext?.flips, []);
  });

  it('demotes a plan with a posture must violation and vetoes when requested', () => {
    const demoteTemplate = planTemplate({ postureHook: 'demotePosture' });
    const vetoTemplate = planTemplate({
      traceLabel: 'veto-plan',
      postureHook: 'vetoPosture',
    });
    const demotePosture = postureEvaluator({
      id: 'demotePosture' as never,
      must: [{ id: 'floor', condition: literal(false), onViolation: 'demote', demotePenalty: literal(-3) }],
    });
    const vetoPosture = postureEvaluator({
      id: 'vetoPosture' as never,
      must: [{ id: 'floor', condition: literal(false), onViolation: 'veto' }],
    });
    const catalog = createCatalog({
      template: demoteTemplate,
      posture: demotePosture,
      profilePlanTemplates: ['trainGovern', 'vetoPlan'],
    });
    const def = {
      ...createDef(),
      agents: {
        ...catalog,
        library: {
          ...catalog.library,
          planTemplates: { trainGovern: demoteTemplate, vetoPlan: vetoTemplate },
          postureEvaluators: {
            ...catalog.library.postureEvaluators,
            vetoPosture: {
              traceLabel: vetoPosture.traceLabel,
              must: [{ id: 'floor', onViolation: 'veto' as const, hasDemotePenalty: false }],
              prefer: [],
              costClass: 'preview' as const,
              dependencies: emptyDependencies,
            },
          },
        },
        compiled: {
          ...catalog.compiled,
          postureEvaluators: {
            ...catalog.compiled.postureEvaluators,
            vetoPosture,
          },
        },
      },
    };
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
    assert.equal(result.alternatives.length, 1);
    assert.equal(result.selected?.templateId, 'trainGovern');
    assert.deepEqual(result.posture.mustViolations, [{ id: 'floor', action: 'demote', penalty: -3 }]);
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
