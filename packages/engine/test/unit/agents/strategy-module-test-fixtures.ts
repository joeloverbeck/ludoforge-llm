import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type AgentPolicyCatalog,
  type CompiledAgentProfile,
  type CompiledPolicyExpr,
  type GameDef,
  type StrategyModuleDef,
} from '../../../src/kernel/index.js';
import { PolicyEvaluationContext, type PolicyEvaluationCandidate } from '../../../src/agents/policy-evaluation-core.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');

export const emptyDependencies = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  selectors: [],
  strategyModules: [],
  strategicConditions: [],
};

export const literal = (value: number | string | boolean): CompiledPolicyExpr => ({ kind: 'literal', value });

export const moduleRef = (moduleId: string, field: Extract<CompiledPolicyExpr, { readonly kind: 'ref' }>['ref']): CompiledPolicyExpr => ({
  kind: 'ref',
  ref: field,
});

export function createStrategyModuleDef(overrides: Partial<StrategyModuleDef> = {}): StrategyModuleDef {
  return {
    id: 'buildEngine' as StrategyModuleDef['id'],
    traceLabel: 'build engine',
    when: literal(true),
    applies: { scopes: ['move'], actionTags: ['good'] },
    priority: { tier: 10, value: literal(4) },
    selectors: [{ role: 'primary' as never, selectorId: 'zonePriority' as never }],
    scoreGroups: [{
      id: 'standing' as never,
      summary: 'sum',
      terms: [{ id: 'base', value: literal(7), weight: 1 }],
    }],
    guardrailIds: [],
    fallback: { ifInactive: 'noContribution', ifSelectorEmpty: 'noContribution' },
    costClass: 'state',
    dependencies: emptyDependencies,
    ...overrides,
  };
}

export function createTraceStrategyModuleDef(
  id: string,
  priorityTier: number,
  active: boolean,
  contribution: number,
  overrides: Partial<StrategyModuleDef> = {},
): StrategyModuleDef {
  return createStrategyModuleDef({
    id: id as StrategyModuleDef['id'],
    traceLabel: `${id} label`,
    when: literal(active),
    applies: { scopes: ['move'] },
    priority: { tier: priorityTier },
    selectors: [],
    scoreGroups: [{
      id: 'standing' as never,
      summary: 'sum',
      terms: [{ id: 'base', value: literal(contribution), weight: 1 }],
    }],
    dependencies: emptyDependencies,
    ...overrides,
  });
}

export function createStrategyModuleGameDef(module: StrategyModuleDef = createStrategyModuleDef()): GameDef {
  const profile: CompiledAgentProfile = {
    fingerprint: 'strategy-module-runtime-profile',
    params: {},
    use: {
      guardrails: ['dropInactive'],
      considerations: ['moduleContribution'],
      tieBreakers: ['stableMoveKey'],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      selectors: [],
      strategyModules: ['buildEngine'],
      guardrails: ['dropInactive'],
      considerations: ['moduleContribution'],
    },
    preview: { mode: 'disabled' },
    selection: { mode: 'argmax' },
  };
  const agents = withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'strategy-module-runtime-catalog',
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
      strategyModules: {
        buildEngine: {
          traceLabel: module.traceLabel,
          applies: module.applies,
          selectors: module.selectors,
          scoreGroups: module.scoreGroups.map((group) => ({ id: group.id, summary: group.summary })),
          guardrailIds: module.guardrailIds,
          fallback: module.fallback,
          costClass: module.costClass,
          dependencies: module.dependencies,
        },
      },
      guardrails: {
        dropInactive: {
          traceLabel: 'drop inactive module candidates',
          scopes: ['move'],
          costClass: 'state',
          when: {
            kind: 'op',
            op: 'not',
            args: [moduleRef('buildEngine', { kind: 'strategyModule', moduleId: 'buildEngine', field: 'active' })],
          },
          severity: 'prune',
          safe: true,
          onAllPruned: { actionId: asActionId('goodMove'), traceLabel: 'fallback good move' },
          onUnavailable: 'noFire',
          dependencies: emptyDependencies,
        },
      },
      considerations: {
        moduleContribution: {
          scopes: ['move'],
          costClass: 'state',
          weight: literal(1),
          value: moduleRef('buildEngine', { kind: 'strategyModule', moduleId: 'buildEngine', field: 'contribution' }),
          dependencies: emptyDependencies,
        },
      },
      tieBreakers: {
        stableMoveKey: {
          kind: 'stableMoveKey',
          costClass: 'state',
          dependencies: emptyDependencies,
        },
      },
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { alpha: 'baseline' },
  });
  const agentsWithCompiledModule: AgentPolicyCatalog = {
    ...agents,
    compiled: {
      ...agents.compiled,
      strategyModules: { buildEngine: module },
    },
  };

  return {
    metadata: { id: 'strategy-module-runtime-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: agentsWithCompiledModule,
    actionTagIndex: {
      byAction: { goodMove: ['good'], badMove: ['bad'] },
      byTag: { good: ['goodMove'], bad: ['badMove'] },
    },
    actions: [
      {
        id: asActionId('goodMove'),
        tags: ['good'],
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('badMove'),
        tags: ['bad'],
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  };
}

export function createCandidate(actionId: string, index: number): PolicyEvaluationCandidate {
  return {
    move: { actionId: asActionId(actionId), params: {} },
    stableMoveKey: `${actionId}|{}|false|unclassified:${index}`,
    actionId,
    previewRefIds: new Set(),
    unknownPreviewRefs: new Map(),
    previewSeatMatrix: new Map(),
    unknownLookupRefs: new Map(),
    unknownCandidateParamRefs: new Map(),
  };
}

export function createInitialStrategyModuleState(def: GameDef) {
  return initialState(def, 7, 2).state;
}

export function createStrategyModuleTraceContext(modules: readonly StrategyModuleDef[]): PolicyEvaluationContext {
  const base = createStrategyModuleGameDef(modules[0]);
  const catalog = base.agents!;
  const def = {
    ...base,
    agents: {
      ...catalog,
      compiled: {
        ...catalog.compiled,
        strategyModules: Object.fromEntries(modules.map((module) => [module.id, module])),
      },
      profiles: {
        ...catalog.profiles,
        baseline: {
          ...catalog.profiles.baseline!,
          plan: {
            ...catalog.profiles.baseline!.plan,
            strategyModules: modules.map((module) => String(module.id)),
          },
        },
      },
    },
  };
  const state = createInitialStrategyModuleState(def);
  return new PolicyEvaluationContext({
    def,
    state,
    playerId: asPlayerId(0),
    seatId: 'alpha',
    catalog: def.agents,
    parameterValues: {},
    trustedMoveIndex: new Map(),
  }, []);
}
