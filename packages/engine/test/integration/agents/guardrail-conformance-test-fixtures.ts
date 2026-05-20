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

export const alphaPlayerId = asPlayerId(0);

export const literal = (value: number | string | boolean): CompiledPolicyExpr => ({ kind: 'literal', value });

export const candidateTag = (tagName: string): CompiledPolicyExpr => ({
  kind: 'ref',
  ref: { kind: 'candidateTag', tagName },
});

export const emptyDependencies = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  selectors: [],
  strategyModules: [],
  strategicConditions: [],
  guardrails: [],
};

export const conformanceMoves = {
  tagged: [
    { actionId: asActionId('badMove'), params: {} },
    { actionId: asActionId('goodMove'), params: {} },
  ] satisfies readonly Move[],
  passOnly: [
    { actionId: asActionId('pass'), params: {} },
  ] satisfies readonly Move[],
};

export function createGuardrail(overrides: Partial<GuardrailDef> = {}): GuardrailDef {
  return {
    id: 'avoidBadMove' as GuardrailDef['id'],
    traceLabel: 'avoid bad move',
    scopes: ['move'],
    when: candidateTag('bad'),
    severity: 'warn',
    onUnavailable: 'noFire',
    costClass: 'candidate',
    dependencies: emptyDependencies,
    ...overrides,
  };
}

export function createGuardrailConformanceDef(guardrail: GuardrailDef): GameDef {
  const profile: CompiledAgentProfile = {
    fingerprint: 'guardrail-conformance-profile',
    params: {},
    use: {
      guardrails: [String(guardrail.id)],
      considerations: [],
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      guardrails: [String(guardrail.id)],
      considerations: [],
    },
    preview: { mode: 'disabled' },
    selection: { mode: 'argmax' },
  };
  const agents = withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'guardrail-conformance-catalog',
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
        [guardrail.id]: {
          traceLabel: guardrail.traceLabel,
          scopes: guardrail.scopes,
          severity: guardrail.severity,
          costClass: guardrail.costClass,
          dependencies: guardrail.dependencies,
          onUnavailable: guardrail.onUnavailable,
          ...(guardrail.safe === undefined ? {} : { safe: guardrail.safe }),
          ...(guardrail.onAllPruned === undefined ? {} : { onAllPruned: guardrail.onAllPruned }),
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
      guardrails: { [guardrail.id]: guardrail },
    },
  };
  return {
    metadata: { id: 'guardrail-conformance-test', players: { min: 2, max: 2 } },
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
    actionTagIndex: {
      byAction: {
        badMove: ['bad'],
        goodMove: ['good'],
        pass: ['pass'],
      },
      byTag: {
        bad: ['badMove'],
        good: ['goodMove'],
        pass: ['pass'],
      },
    },
    actions: [
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

export function createConformanceState(def: GameDef, seed = 7): GameState {
  return initialState(def, seed, 2).state;
}
