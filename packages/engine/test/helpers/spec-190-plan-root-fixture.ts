import {
  asActionId,
  asDecisionFrameId,
  asPhaseId,
  asSeatId,
  asTurnId,
  assertValidatedGameDef,
  createRng,
  initialState,
  type AgentMicroturnDecisionInput,
  type AgentPolicyCatalog,
  type CompiledAgentProfile,
  type CompiledPlanTemplate,
  type CompiledPolicySelector,
  type Decision,
  type MicroturnState,
  type StrategyModuleDef,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { createSyntheticDecisionDef } from './synthetic-decision-fixture.js';

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

const planTemplate = (): CompiledPlanTemplate => ({
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

const strategyModule = (): StrategyModuleDef => ({
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
  enablesPlanTemplates: [],
  suppressesPlanTemplates: [],
});

const createCatalog = (): AgentPolicyCatalog => {
  const selector = roleSelector();
  const template = planTemplate();
  const module = strategyModule();
  const profile: CompiledAgentProfile = {
    fingerprint: 'spec-190-plan-primary-root',
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
      planTemplates: ['trainGovern'],
      considerations: [],
    },
  };
  return {
    schemaVersion: 3,
    catalogFingerprint: 'spec-190-plan-primary-root',
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
          enablesPlanTemplates: module.enablesPlanTemplates,
          suppressesPlanTemplates: module.suppressesPlanTemplates,
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
      selectors: { trainSpaceSelector: selector },
      strategyModules: { 'doctrine.train': module },
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { alpha: 'baseline' },
  };
};

export const createSpec190PlanRootDef = (): ValidatedGameDef => {
  const base = createSyntheticDecisionDef();
  return assertValidatedGameDef({
    ...base,
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    actionTagIndex: {
      byAction: { branch: ['train'] },
      byTag: { train: ['branch'] },
    },
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    terminal: { conditions: [{ when: { op: '>=', left: { _t: 2 as const, ref: 'gvar', var: 'score' }, right: 3 }, result: { type: 'draw' } }] },
    agents: createCatalog(),
  });
};

export const spec190ActionDecision = (rank: number): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId('branch'),
  move: { actionId: asActionId('branch'), params: { rank } },
});

export const createSpec190ActionSelectionInput = (
  seed: number,
  legalActions: readonly Extract<Decision, { readonly kind: 'actionSelection' }>[] = [
    spec190ActionDecision(2),
    spec190ActionDecision(1),
  ],
): AgentMicroturnDecisionInput => {
  const def = createSpec190PlanRootDef();
  const state = initialState(def, seed, 2).state;
  const microturn: MicroturnState = {
    kind: 'actionSelection',
    seatId: asSeatId('alpha'),
    decisionContext: {
      kind: 'actionSelection',
      seatId: asSeatId('alpha'),
      eligibleActions: [asActionId('branch')],
    },
    legalActions,
    projectedState: { state },
    turnId: asTurnId(1),
    frameId: asDecisionFrameId(1),
    compoundTurnTrace: [],
  };
  return { def, state, microturn, rng: createRng(BigInt(seed)) };
};
