import { resolveLookupViaSeatResolution } from '../../../src/agents/policy-lookup-surface.js';
import { scoreMicroturnOptionWithContributions } from '../../../src/agents/microturn-option-eval.js';
import type { DecisionKey } from '../../../src/kernel/decision-scope.js';
import { buildSeatResolutionIndex } from '../../../src/kernel/identity.js';
import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  assertValidatedGameDef,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyLiteral,
  type ChoicePendingChooseOneRequest,
  type CompiledAgentPolicyRef,
  type CompiledPolicyConsideration,
  type CompiledPolicyExpr,
  type CompiledSurfaceCatalog,
  type GameDef,
  type GameState,
  type LookupRefStatus,
  type MoveParamValue,
  type AgentParameterValue,
} from '../../../src/kernel/index.js';

const publicVisibility = { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } } as const;
const seatVisibleVisibility = { current: 'seatVisible', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } } as const;
const hiddenVisibility = { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } } as const;

export const lookupSurfaceVisibility: CompiledSurfaceCatalog = {
  globalVars: { morale: publicVisibility },
  globalMarkers: { campaignStatus: publicVisibility },
  perPlayerVars: { influence: seatVisibleVisibility },
  derivedMetrics: {},
  victory: {
    currentMargin: publicVisibility,
    currentRank: publicVisibility,
  },
  activeCardIdentity: hiddenVisibility,
  activeCardTag: hiddenVisibility,
  activeCardMetadata: hiddenVisibility,
  activeCardAnnotation: hiddenVisibility,
};

export const lookupDef: GameDef = assertValidatedGameDef({
  metadata: { id: 'lookup-refs-fixture', players: { min: 2, max: 2 } },
  constants: {},
  seats: [{ id: 'seatA' }, { id: 'seatB' }],
  globalVars: [{ name: 'morale', type: 'int', init: 9, min: 0, max: 20 }],
  perPlayerVars: [{ name: 'influence', type: 'int', init: 0, min: 0, max: 20 }],
  zones: [
    {
      id: asZoneId('public-zone:none'),
      owner: 'none',
      visibility: 'public',
      ordering: 'set',
      category: 'region',
      attributes: { population: 4 },
    },
    {
      id: asZoneId('private-zone:0'),
      owner: 'player',
      ownerPlayerIndex: 0,
      visibility: 'owner',
      ordering: 'set',
      category: 'region',
      attributes: { population: 7 },
    },
  ],
  tokenTypes: [{ id: 'unit', props: { strength: 'int' } }],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  observers: {
    schemaVersion: 1,
    catalogFingerprint: 'lookup-refs-fixture',
    defaultObserverName: 'currentPlayer',
    observers: {
      currentPlayer: {
        fingerprint: 'current-player',
        surfaces: lookupSurfaceVisibility,
        zones: {
          entries: {
            'public-zone': { tokens: 'public', order: 'public' },
          },
          defaultEntry: { tokens: 'owner', order: 'owner' },
        },
      },
    },
  },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

export const lookupState: GameState = {
  ...initialState(lookupDef, 1, 2).state,
  perPlayerVars: {
    0: { influence: 5 },
    1: { influence: 2 },
  },
  zones: {
    'public-zone:none': [
      { id: asTokenId('unit-public'), type: 'unit', props: { strength: 3 } },
    ],
    'private-zone:0': [
      { id: asTokenId('unit-private'), type: 'unit', props: { strength: 8 } },
    ],
  },
  globalMarkers: { campaignStatus: 'active' },
};

const emptyDependencies = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  strategicConditions: [],
};

export const literalExpr = (value: AgentPolicyLiteral): CompiledPolicyExpr => ({ kind: 'literal', value });

export const lookupRef = (
  collection: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>['collection'],
  keyType: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>['keyType'],
  key: CompiledPolicyExpr,
  path: readonly string[],
): Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }> => ({
  kind: 'lookup',
  surface: 'policyState',
  collection,
  keyType,
  key,
  path,
  onMissing: 'unavailable',
  onHidden: 'unavailable',
});

export function resolveLookup(
  ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>,
  keyValue: AgentParameterValue,
  seatContext = 'seatA',
): LookupRefStatus {
  const observerProfile = lookupDef.observers?.observers.currentPlayer;
  return resolveLookupViaSeatResolution({
    def: lookupDef,
    state: lookupState,
    actingSeatId: 'seatA',
    actingPlayerIndex: 0,
    seatResolutionIndex: buildSeatResolutionIndex(lookupDef, lookupState.playerCount),
    surfaceVisibility: lookupSurfaceVisibility,
    ...(observerProfile === undefined ? {} : { observerProfile }),
  }, ref, keyValue, seatContext);
}

export function scoreLookupOption(
  optionValue: MoveParamValue,
  refs: readonly Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>[],
): ReturnType<typeof scoreMicroturnOptionWithContributions> {
  const considerations: Record<string, CompiledPolicyConsideration> = {};
  refs.forEach((ref, index) => {
    considerations[`lookup${index}`] = {
      scopes: ['microturn'],
      costClass: 'state',
      weight: literalExpr(1),
      value: { kind: 'ref', ref },
      hasLookupRef: true,
      dependencies: emptyDependencies,
    };
  });

  const catalog: AgentPolicyCatalog = {
    schemaVersion: 2,
    catalogFingerprint: 'lookup-refs-fixture',
    surfaceVisibility: lookupSurfaceVisibility,
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    compiled: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
      considerations,
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {},
    bindingsBySeat: {},
  };
  const request: ChoicePendingChooseOneRequest = {
    kind: 'pending',
    complete: false,
    decisionKey: '$lookupTarget' as DecisionKey,
    name: '$lookupTarget',
    options: [{ value: optionValue, legality: 'legal', illegalReason: null }],
    targetKinds: ['zone'],
    type: 'chooseOne',
  };

  return scoreMicroturnOptionWithContributions(
    lookupState,
    lookupDef,
    catalog,
    asPlayerId(0),
    'seatA',
    {},
    request,
    optionValue,
    0,
    Object.keys(considerations),
  );
}
