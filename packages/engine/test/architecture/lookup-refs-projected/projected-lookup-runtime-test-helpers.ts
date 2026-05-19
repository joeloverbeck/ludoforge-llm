import { PolicyEvaluationContext, type PolicyEvaluationCandidate } from '../../../src/agents/policy-evaluation-core.js';
import { scoreMicroturnOptionWithContributions } from '../../../src/agents/microturn-option-eval.js';
import type { PreviewOptionProjectedState } from '../../../src/agents/policy-runtime.js';
import type { DecisionKey } from '../../../src/kernel/decision-scope.js';
import {
  asActionId,
  asPlayerId,
  asTokenId,
  type AgentPolicyCatalog,
  type ChoicePendingChooseOneRequest,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type CompiledPolicyConsideration,
  type CompiledPolicyExpr,
  type GameState,
  type MoveParamValue,
} from '../../../src/kernel/index.js';
import {
  literalExpr,
  lookupDef,
  lookupState,
  lookupSurfaceVisibility,
  microturnOptionValueExpr,
} from '../lookup-refs/lookup-refs-fixture.js';

export const assertProjectedZoneUnknownRef = (
  entries: readonly (readonly [string, string])[],
  reason: string,
): void => {
  if (entries.length !== 1) {
    throw new Error(`Expected exactly one unknown projected lookup ref, got ${entries.length}.`);
  }
  const [refId, actualReason] = entries[0]!;
  if (!refId.startsWith('lookup.previewOptionState.zones.ZoneId.')) {
    throw new Error(`Expected projected lookup ref id, got ${refId}.`);
  }
  if (!refId.endsWith('.variables.population')) {
    throw new Error(`Expected variables.population lookup ref id, got ${refId}.`);
  }
  if (actualReason !== reason) {
    throw new Error(`Expected reason ${reason}, got ${actualReason}.`);
  }
};

const emptyDependencies = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  strategicConditions: [],
};

export const projectedLookupRef = (
  collection: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>['collection'],
  keyType: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>['keyType'],
  key: CompiledPolicyExpr,
  path: readonly string[],
): Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }> => ({
  kind: 'lookup',
  surface: 'previewOptionState',
  collection,
  keyType,
  key,
  path,
  onMissing: 'unavailable',
  onHidden: 'unavailable',
});

const createProjectedConsideration = (
  ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>,
  weight = 1,
): CompiledPolicyConsideration => ({
  scopes: ['microturn'],
  costClass: 'preview',
  weight: literalExpr(weight),
  value: { kind: 'ref', ref },
  hasPreviewRef: true,
  hasLookupRef: true,
  previewFallback: { onUnavailable: 'noContribution' },
  dependencies: emptyDependencies,
});

export function createProjectedCatalog(
  considerations: Record<string, CompiledPolicyConsideration>,
): AgentPolicyCatalog {
  const profile: CompiledAgentProfile = {
    fingerprint: 'projected-lookup-runtime',
    observerName: 'currentPlayer',
    params: {},
    use: {
      considerations: Object.keys(considerations),
      guardrails: [],
      tieBreakers: [],
    },
    preview: {
      mode: 'exactWorld',
      inner: {
        chooseOne: true,
        chooseNStep: true,
        maxOptions: 4,
        chooseNBeamWidth: 1,
        depthCap: 4,
        strategy: 'singlePass',
        capClass: 'standard256',
      },
    },
    selection: { mode: 'argmax' },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations: Object.keys(considerations),
    },
  };
  return {
    schemaVersion: 2,
    catalogFingerprint: 'projected-lookup-runtime',
    surfaceVisibility: lookupSurfaceVisibility,
    parameterDefs: {},
    candidateParamDefs: {
      target: { type: 'id' },
    },
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      guardrails: {},
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    compiled: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      guardrails: {},
      considerations,
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { projected: profile },
    bindingsBySeat: { seatA: 'projected', seatB: 'projected' },
  };
}

export const projectedState: GameState = {
  ...lookupState,
  zoneVars: {
    ...lookupState.zoneVars,
    'public-zone:none': { population: 11 },
    'private-zone:0': { population: 17 },
  },
  perPlayerVars: {
    0: { influence: 13 },
    1: { influence: 2 },
  },
  globalVars: {
    ...lookupState.globalVars,
    morale: 19,
  },
  zones: {
    ...lookupState.zones,
    'public-zone:none': [
      { id: asTokenId('unit-public'), type: 'unit', props: { strength: 23 } },
    ],
  },
};

export const readyProjectedState: PreviewOptionProjectedState = {
  state: projectedState,
  outcome: 'ready',
  driveDepth: 2,
  completionPolicy: 'greedy',
  capClass: 'standard256',
};

export const depthCappedProjectedState: PreviewOptionProjectedState = {
  state: projectedState,
  outcome: 'depthCap',
  driveDepth: 2,
  completionPolicy: 'greedy',
  capClass: 'standard256',
};

export function scoreProjectedOption(
  refs: readonly Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>[],
  optionValue: MoveParamValue,
  previewState: PreviewOptionProjectedState,
  seatId = 'seatA',
) {
  const considerations = Object.fromEntries(
    refs.map((ref, index) => [`projected${index}`, createProjectedConsideration(ref)]),
  );
  const request: ChoicePendingChooseOneRequest = {
    kind: 'pending',
    complete: false,
    decisionKey: '$projectedTarget' as DecisionKey,
    name: '$projectedTarget',
    options: [{ value: optionValue, legality: 'legal', illegalReason: null }],
    targetKinds: ['zone'],
    type: 'chooseOne',
  };
  return scoreMicroturnOptionWithContributions(
    lookupState,
    lookupDef,
    createProjectedCatalog(considerations),
    asPlayerId(seatId === 'seatA' ? 0 : 1),
    seatId,
    {},
    request,
    optionValue,
    0,
    Object.keys(considerations),
    undefined,
    new Map(),
    previewState,
  );
}

export function evaluateActionSelectionProjectedLookup() {
  const ref = projectedLookupRef('zones', 'ZoneId', {
    kind: 'ref',
    ref: { kind: 'candidateParam', id: 'target', onMissing: 'unavailable' },
  }, ['variables', 'population']);
  const considerations = { projected0: createProjectedConsideration(ref) };
  const candidate: PolicyEvaluationCandidate = {
    move: { actionId: asActionId('choose-target'), params: { target: 'public-zone:none' } },
    stableMoveKey: 'choose-target',
    actionId: 'choose-target',
    previewRefIds: new Set(),
    unknownPreviewRefs: new Map(),
    unknownLookupRefs: new Map(),
    unknownCandidateParamRefs: new Map(),
  };
  const evaluation = new PolicyEvaluationContext({
    def: lookupDef,
    state: lookupState,
    playerId: asPlayerId(0),
    seatId: 'seatA',
    catalog: createProjectedCatalog(considerations),
    parameterValues: {},
    trustedMoveIndex: new Map(),
  }, [candidate]);
  try {
    const score = evaluation.evaluateConsideration(considerations, 'projected0', candidate);
    return { score, candidate };
  } finally {
    evaluation.dispose();
  }
}

export const zonePopulationRef = projectedLookupRef(
  'zones',
  'ZoneId',
  microturnOptionValueExpr,
  ['variables', 'population'],
);
