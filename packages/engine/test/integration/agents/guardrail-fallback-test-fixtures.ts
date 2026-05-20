import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type AgentPolicyCatalog,
  type CompiledAgentProfile,
  type CompiledPolicyExpr,
  type GameDef,
  type GameState,
  type GuardrailDef,
  type Move,
} from '../../../src/kernel/index.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');

export const guardrailLiteral = (value: number | string | boolean): CompiledPolicyExpr => ({ kind: 'literal', value });

export const emptyGuardrailDependencies = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  selectors: [],
  strategyModules: [],
  strategicConditions: [],
};

export function createGuardrailFallbackDef(): GameDef {
  const guardrail: GuardrailDef = {
    id: 'dropEverything' as GuardrailDef['id'],
    traceLabel: 'drop everything',
    scopes: ['move'],
    when: guardrailLiteral(true),
    severity: 'prune',
    safe: true,
    onAllPruned: {
      actionId: asActionId('pass'),
      traceLabel: 'take pass fallback',
    },
    onUnavailable: 'noFire',
    costClass: 'state',
    dependencies: emptyGuardrailDependencies,
  };
  const profile: CompiledAgentProfile = {
    fingerprint: 'guardrail-fallback-profile',
    params: {},
    use: {
      guardrails: ['dropEverything'],
      considerations: [],
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      guardrails: ['dropEverything'],
      considerations: [],
    },
    preview: { mode: 'disabled' },
    selection: { mode: 'argmax' },
  };
  const agents = withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'guardrail-fallback-catalog',
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
      guardrails: {
        dropEverything: {
          traceLabel: guardrail.traceLabel,
          scopes: guardrail.scopes,
          severity: guardrail.severity,
          costClass: guardrail.costClass,
          dependencies: guardrail.dependencies,
          safe: true,
          onUnavailable: guardrail.onUnavailable,
          onAllPruned: guardrail.onAllPruned!,
        },
      },
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { alpha: 'baseline' },
  });
  const catalog: AgentPolicyCatalog = {
    ...agents,
    compiled: {
      ...agents.compiled,
      guardrails: { dropEverything: guardrail },
    },
  };
  return {
    metadata: { id: 'guardrail-fallback-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [
      {
        id: asActionId('attack'),
        tags: ['attack'],
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
        id: asActionId('pass'),
        tags: ['pass'],
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

export function createGuardrailFallbackState(def: GameDef): GameState {
  return initialState(def, 7, 2).state;
}

export const guardrailFallbackMoves = {
  withPass: [
    { actionId: asActionId('attack'), params: {} },
    { actionId: asActionId('pass'), params: {} },
  ] satisfies readonly Move[],
  withoutPass: [
    { actionId: asActionId('attack'), params: {} },
  ] satisfies readonly Move[],
};

export const alphaPlayerId = asPlayerId(0);
