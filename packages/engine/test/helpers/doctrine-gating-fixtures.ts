import { buildPlanProposalTrace } from '../../src/agents/plan-trace.js';
import { proposeAdvisoryTurnPlan, type PlanProposalResult } from '../../src/agents/plan-proposal.js';
import {
  asActionId,
  asPlayerId,
  initialState,
  type AgentPolicyCatalog,
  type CompiledAgentProfile,
  type CompiledPlanTemplate,
  type Decision,
  type GameDef,
  type StrategyModuleDef,
} from '../../src/kernel/index.js';
import type { PolicyPlanTrace } from '../../src/kernel/types.js';
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

export const doctrinePlanTemplate = (id: string): CompiledPlanTemplate => ({
  traceLabel: id,
  root: { actionTags: [], actionIds: ['branch'] },
  roles: {
    actor: {
      selectorId: 'actorSelector' as never,
      required: true,
      constraints: [],
      selector: {
        selectorId: 'actorSelector' as never,
        role: 'actor',
        scopes: ['move'],
        source: { kind: 'collection', collection: { kind: 'players' } },
        result: { maxItems: 1, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
        costClass: 'state',
        dependencies: emptyDependencies,
        refs: {
          id: 'role.actor.id',
          quality: 'role.actor.quality',
          rank: 'role.actor.rank',
          components: 'role.actor.components',
        },
      },
    },
  },
  steps: [{
    label: 'branch',
    role: 'actor',
    match: { decisionKind: 'actionSelection', targetKind: 'action', decisionPath: 'actionId' },
  }],
  caps: { capClass: 'standard256', maxSteps: 1 },
  fallback: {},
  dependencies: emptyDependencies,
});

export const doctrineStrategyModule = (overrides: Partial<StrategyModuleDef> = {}): StrategyModuleDef => ({
  id: 'doctrine.branch' as never,
  traceLabel: 'branch doctrine',
  when: literal(true),
  applies: { scopes: ['move'] },
  priority: { tier: 1 },
  selectors: [],
  scoreGroups: [],
  guardrailIds: [],
  fallback: { ifInactive: 'noContribution', ifSelectorEmpty: 'noContribution' },
  costClass: 'state',
  dependencies: emptyDependencies,
  enablesPlanTemplates: [],
  suppressesPlanTemplates: [],
  ...overrides,
});

export function createDoctrineGatingCatalog(options: {
  readonly modules?: readonly StrategyModuleDef[];
  readonly planTemplates?: readonly string[];
} = {}): AgentPolicyCatalog {
  const modules = options.modules ?? [doctrineStrategyModule()];
  const planTemplates = options.planTemplates ?? ['alpha', 'beta', 'gamma'];
  const profile: CompiledAgentProfile = {
    fingerprint: 'doctrine-gating-fixture',
    params: {},
    use: { considerations: [], strategyModules: modules.map((module) => String(module.id)), tieBreakers: [] },
    preview: { mode: 'disabled' },
    selection: { mode: 'argmax' },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      strategyModules: modules.map((module) => String(module.id)),
      planTemplates,
      considerations: [],
    },
  };
  const strategyModules = Object.fromEntries(modules.map((module) => [String(module.id), module]));
  return {
    schemaVersion: 3,
    catalogFingerprint: 'doctrine-gating-fixture',
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
      strategyModules: Object.fromEntries(modules.map((module) => [
        String(module.id),
        {
          traceLabel: module.traceLabel,
          applies: module.applies,
          selectors: module.selectors,
          scoreGroups: module.scoreGroups,
          guardrailIds: module.guardrailIds,
          fallback: module.fallback,
          costClass: module.costClass,
          dependencies: module.dependencies,
          enablesPlanTemplates: module.enablesPlanTemplates,
          suppressesPlanTemplates: module.suppressesPlanTemplates,
        },
      ])),
      planTemplates: Object.fromEntries(planTemplates.map((id) => [id, doctrinePlanTemplate(id)])),
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    compiled: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      selectors: {},
      strategyModules,
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { alpha: 'baseline' },
  };
}

export const actionDecision = (): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId('branch'),
  move: { actionId: asActionId('branch'), params: {} },
});

export function proposeDoctrineGatingPlan(catalog: AgentPolicyCatalog): PlanProposalResult {
  const def: GameDef = { ...createSyntheticDecisionDef(), agents: catalog };
  const state = initialState(def, 197, 2).state;
  return proposeAdvisoryTurnPlan({
    def,
    state,
    seatId: 'alpha',
    playerId: asPlayerId(0),
    profile: catalog.profiles.baseline!,
    catalog,
    actionDecisions: [actionDecision()],
  });
}

export function richDoctrineGatingCatalog(): AgentPolicyCatalog {
  return createDoctrineGatingCatalog({
    modules: [
      doctrineStrategyModule({ id: 'doctrine.enable' as never, enablesPlanTemplates: ['alpha' as never, 'beta' as never] }),
      doctrineStrategyModule({ id: 'doctrine.suppress' as never, suppressesPlanTemplates: ['beta' as never] }),
    ],
  });
}

export function richDoctrineGatingTrace(): PolicyPlanTrace {
  return buildPlanProposalTrace(proposeDoctrineGatingPlan(richDoctrineGatingCatalog()));
}
