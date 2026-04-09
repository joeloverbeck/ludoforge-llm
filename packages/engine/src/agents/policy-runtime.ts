import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import { resolveCurrentEventCardState } from '../kernel/event-execution.js';
import { buildSeatResolutionIndex, resolvePlayerIndexForSeatValue, type SeatResolutionIndex } from '../kernel/identity.js';
import type { PlayerId } from '../kernel/branded.js';
import type {
  CompiledCardMetadataEntry,
  AgentParameterValue,
  AgentPolicyCatalog,
  ChoicePendingRequest,
  CompiledAgentPolicyRef,
  CompiledCurrentSurfaceRef,
  CompiledPreviewSurfaceRef,
  GameDef,
  GameState,
  MoveParamValue,
  Move,
  TrustedExecutableMove,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import {
  createPolicyPreviewRuntime,
  type PolicyPreviewDependencies,
  type PolicyPreviewGrantedOperation,
  type PolicyPreviewTraceOutcome,
  type PolicyPreviewSurfaceResolution,
} from './policy-preview.js';
import {
  buildPolicyVictorySurface,
  getPolicySurfaceVisibility,
  isSurfaceVisibilityAccessible,
  resolvePolicyRoleSelector,
  type PolicyVictorySurface,
} from './policy-surface.js';
import { extractAnnotationValue } from './policy-annotation-resolve.js';

export type PolicyValue = AgentParameterValue | undefined;

export interface PolicyRuntimeCandidate {
  readonly move: Move;
  readonly stableMoveKey: string;
  readonly actionId: string;
}

export interface PolicyIntrinsicProvider {
  resolveSeatIntrinsic(
    intrinsic: Extract<CompiledAgentPolicyRef, { readonly kind: 'seatIntrinsic' }>['intrinsic'],
    stateOverride?: GameState,
  ): PolicyValue;
  resolveTurnIntrinsic(
    intrinsic: Extract<CompiledAgentPolicyRef, { readonly kind: 'turnIntrinsic' }>['intrinsic'],
    stateOverride?: GameState,
  ): PolicyValue;
}

export interface PolicyCandidateProvider {
  resolveCandidateIntrinsic(
    candidate: PolicyRuntimeCandidate,
    intrinsic: Extract<CompiledAgentPolicyRef, { readonly kind: 'candidateIntrinsic' }>['intrinsic'],
  ): PolicyValue;
  resolveCandidateParam(candidate: PolicyRuntimeCandidate, paramId: string): PolicyValue;
}

export interface PolicyCurrentSurfaceProvider {
  resolveSurface(ref: CompiledCurrentSurfaceRef, stateOverride?: GameState): PolicyValue;
}

export interface PolicyPreviewSurfaceProvider {
  resolveSurface(
    candidate: PolicyRuntimeCandidate,
    ref: CompiledPreviewSurfaceRef,
  ): PolicyPreviewSurfaceResolution;
  getPreviewState(candidate: PolicyRuntimeCandidate): GameState | undefined;
  getOutcome(candidate: PolicyRuntimeCandidate): PolicyPreviewTraceOutcome;
  getFailureReason(candidate: PolicyRuntimeCandidate): string | undefined;
  getGrantedOperation(candidate: PolicyRuntimeCandidate): PolicyPreviewGrantedOperation | undefined;
}

export interface PolicyCompletionProvider {
  resolveDecisionIntrinsic(
    intrinsic: Extract<CompiledAgentPolicyRef, { readonly kind: 'decisionIntrinsic' }>['intrinsic'],
  ): PolicyValue;
  resolveOptionIntrinsic(
    intrinsic: Extract<CompiledAgentPolicyRef, { readonly kind: 'optionIntrinsic' }>['intrinsic'],
  ): PolicyValue;
}

export interface PolicyRuntimeProviders {
  readonly intrinsics: PolicyIntrinsicProvider;
  readonly candidates: PolicyCandidateProvider;
  readonly currentSurface: PolicyCurrentSurfaceProvider;
  readonly previewSurface: PolicyPreviewSurfaceProvider;
  readonly completion?: PolicyCompletionProvider;
}

export interface CreatePolicyRuntimeProvidersInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly seatId: string;
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;
  readonly catalog: AgentPolicyCatalog;
  readonly previewDependencies?: PolicyPreviewDependencies;
  readonly runtime?: GameDefRuntime;
  readonly completion?: {
    readonly request: ChoicePendingRequest;
    readonly optionValue: MoveParamValue;
  };
  readonly runtimeError: (code: string, message: string, detail?: Readonly<Record<string, unknown>>) => Error;
}

export function createPolicyRuntimeProviders(input: CreatePolicyRuntimeProvidersInput): PolicyRuntimeProviders {
  const seatResolutionIndex = buildSeatResolutionIndex(input.def, input.state.playerCount);
  const activeProfileId = input.catalog.bindingsBySeat[input.seatId];
  const activeProfile = activeProfileId !== undefined ? input.catalog.profiles[activeProfileId] : undefined;
  const previewRuntime = createPolicyPreviewRuntime({
    def: input.def,
    state: input.state,
    playerId: input.playerId,
    seatId: input.seatId,
    trustedMoveIndex: input.trustedMoveIndex,
    previewMode: activeProfile?.preview.mode ?? 'exactWorld',
    ...(input.previewDependencies === undefined ? {} : { dependencies: input.previewDependencies }),
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
  });
  const metricCacheByState = new Map<bigint, Map<string, number>>();
  const victorySurfaceByState = new Map<bigint, PolicyVictorySurface>();
  const activeCardEntryByState = new Map<bigint, CompiledCardMetadataEntry | undefined>();

  function getMetricCache(state: GameState): Map<string, number> {
    let cache = metricCacheByState.get(state.stateHash);
    if (cache === undefined) {
      cache = new Map<string, number>();
      metricCacheByState.set(state.stateHash, cache);
    }
    return cache;
  }

  function getVictorySurface(state: GameState): PolicyVictorySurface {
    let surface = victorySurfaceByState.get(state.stateHash);
    if (surface !== undefined) {
      return surface;
    }
    surface = buildPolicyVictorySurface(input.def, state, input.runtime);
    victorySurfaceByState.set(state.stateHash, surface);
    return surface;
  }

  function getActiveCardEntry(state: GameState): CompiledCardMetadataEntry | undefined {
    if (activeCardEntryByState.has(state.stateHash)) {
      return activeCardEntryByState.get(state.stateHash);
    }
    const entry = resolveActiveCardEntry(input.def, state);
    activeCardEntryByState.set(state.stateHash, entry);
    return entry;
  }

  return {
    intrinsics: {
      resolveSeatIntrinsic(intrinsic, stateOverride) {
        const state = stateOverride ?? input.state;
        const activeSeat = input.def.seats?.[state.activePlayer]?.id ?? null;
        return intrinsic === 'self' ? input.seatId : activeSeat ?? undefined;
      },
      resolveTurnIntrinsic(intrinsic, stateOverride) {
        const state = stateOverride ?? input.state;
        if (intrinsic === 'phaseId') {
          return String(state.currentPhase);
        }
        if (intrinsic === 'stepId') {
          return undefined;
        }
        return state.turnCount;
      },
    },
    candidates: {
      resolveCandidateIntrinsic(candidate, intrinsic) {
        if (intrinsic === 'actionId') {
          return candidate.actionId;
        }
        if (intrinsic === 'stableMoveKey') {
          return candidate.stableMoveKey;
        }
        // paramCount — remaining case
        return Object.keys(candidate.move.params).length;
      },
      resolveCandidateParam(candidate, paramId) {
        const candidateParamDef = input.catalog.candidateParamDefs[paramId];
        if (candidateParamDef === undefined) {
          return undefined;
        }
        let paramValue = candidate.move.params[paramId];
        if (paramValue === undefined) {
          const suffix = `::${paramId}`;
          const indexedPrefix = `::${paramId}[`;
          for (const key of Object.keys(candidate.move.params)) {
            if (key.endsWith(suffix) || key.includes(indexedPrefix)) {
              paramValue = candidate.move.params[key];
              break;
            }
          }
        }
        switch (candidateParamDef.type) {
          case 'number':
            return typeof paramValue === 'number' ? paramValue : undefined;
          case 'boolean':
            return typeof paramValue === 'boolean' ? paramValue : undefined;
          case 'id':
            return typeof paramValue === 'string' ? paramValue : undefined;
          case 'idList':
            return Array.isArray(paramValue) && paramValue.every((entry) => typeof entry === 'string')
              ? paramValue as AgentParameterValue
              : undefined;
        }
      },
    },
    currentSurface: {
      resolveSurface(ref, stateOverride) {
        const state = stateOverride ?? input.state;
        const visibility = getPolicySurfaceVisibility(input.catalog.surfaceVisibility, ref);
        if (visibility === null) {
          throw input.runtimeError(
            'UNSUPPORTED_RUNTIME_REF',
            `Policy runtime ref "${ref.family}:${ref.id}" is unsupported by the non-preview evaluator runtime.`,
            { ref },
          );
        }
        const targetPlayerIndex = ref.family === 'perPlayerVar'
          ? resolvePerPlayerTargetIndex(input.def, state, ref, input.playerId, input.seatId, seatResolutionIndex)
          : undefined;
        const resolvedSeatId = ref.selector?.kind !== 'role'
          ? undefined
          : resolvePolicyRoleSelector(input.def, state, ref.selector, input.seatId);
        if (!isSurfaceVisibilityAccessible(
          visibility.current,
          input.seatId,
          resolvedSeatId,
          Number(input.playerId),
          targetPlayerIndex,
        )) {
          return undefined;
        }
        if (ref.family === 'derivedMetric') {
          const metricCache = getMetricCache(state);
          if (metricCache.has(ref.id)) {
            return metricCache.get(ref.id);
          }
          const value = computeDerivedMetricValue(input.def, state, ref.id);
          metricCache.set(ref.id, value);
          return value;
        }
        if (ref.family === 'globalVar') {
          const value = state.globalVars[ref.id];
          return typeof value === 'number' ? value : undefined;
        }
        if (ref.family === 'globalMarker') {
          const markerState = state.globalMarkers?.[ref.id];
          if (markerState !== undefined) {
            return markerState;
          }
          const lattice = input.def.globalMarkerLattices?.find((entry) => entry.id === ref.id);
          return lattice?.defaultState;
        }
        if (ref.family === 'perPlayerVar') {
          return resolveSeatVarRef(state, ref, targetPlayerIndex);
        }
        if (ref.family === 'activeCardAnnotation') {
          const current = resolveCurrentEventCardState(input.def, state);
          if (current === null) {
            return undefined;
          }
          const annotation = input.def.cardAnnotationIndex?.entries[current.card.id];
          if (annotation === undefined) {
            return undefined;
          }
          const activeSeat = input.def.seats?.[state.activePlayer]?.id ?? null;
          return extractAnnotationValue(annotation, ref, input.seatId, activeSeat ?? undefined);
        }
        if (ref.family === 'activeCardIdentity' || ref.family === 'activeCardTag' || ref.family === 'activeCardMetadata') {
          const activeCardEntry = getActiveCardEntry(state);
          if (activeCardEntry === undefined) {
            return undefined;
          }
          return resolveActiveCardFamily(activeCardEntry, ref.family, ref.id);
        }
        if ((input.def.terminal.margins ?? []).length === 0) {
          throw input.runtimeError(
            'UNSUPPORTED_RUNTIME_REF',
            'victory.currentMargin/currentRank refs require def.terminal.margins to be defined.',
          );
        }
        let victorySurface: PolicyVictorySurface;
        try {
          victorySurface = getVictorySurface(state);
        } catch (error) {
          throw input.runtimeError(
            'RUNTIME_EVALUATION_ERROR',
            error instanceof Error ? error.message : 'Unknown victory surface evaluation failure.',
          );
        }
        if (ref.selector?.kind !== 'role') {
          return undefined;
        }
        const seatId = resolvePolicyRoleSelector(input.def, state, ref.selector, input.seatId);
        if (seatId === undefined) {
          return undefined;
        }
        return ref.family === 'victoryCurrentMargin'
          ? victorySurface.marginBySeat.get(seatId)
          : victorySurface.rankBySeat.get(seatId);
      },
    },
    previewSurface: {
      resolveSurface(candidate, ref) {
        return previewRuntime.resolveSurface(candidate, ref);
      },
      getPreviewState(candidate) {
        return previewRuntime.getPreviewState(candidate);
      },
      getOutcome(candidate) {
        return previewRuntime.getOutcome(candidate);
      },
      getFailureReason(candidate) {
        return previewRuntime.getFailureReason(candidate);
      },
      getGrantedOperation(candidate) {
        return previewRuntime.getGrantedOperation(candidate);
      },
    },
    ...(input.completion === undefined
      ? {}
      : {
          completion: createPolicyCompletionProvider(
            input.completion.request,
            input.completion.optionValue,
          ),
        }),
  };
}

export function createPolicyCompletionProvider(
  request: ChoicePendingRequest,
  optionValue: MoveParamValue,
): PolicyCompletionProvider {
  return {
    resolveDecisionIntrinsic(intrinsic) {
      switch (intrinsic) {
        case 'type':
          return request.type;
        case 'name':
          return request.name;
        case 'targetKind':
          return request.targetKinds[0] ?? 'unknown';
        case 'optionCount':
          return request.options.length;
      }
    },
    resolveOptionIntrinsic(intrinsic) {
      return intrinsic === 'value' ? normalizeCompletionOptionValue(optionValue) : undefined;
    },
  };
}

function normalizeCompletionOptionValue(optionValue: MoveParamValue): PolicyValue {
  if (Array.isArray(optionValue)) {
    return optionValue.every((entry) => typeof entry === 'string') ? optionValue as AgentParameterValue : undefined;
  }
  return typeof optionValue === 'string' || typeof optionValue === 'number' || typeof optionValue === 'boolean'
    ? optionValue
    : undefined;
}

function resolvePerPlayerTargetIndex(
  def: GameDef,
  state: GameState,
  ref: CompiledCurrentSurfaceRef | CompiledPreviewSurfaceRef,
  actingPlayerId: PlayerId,
  seatId: string,
  seatResolutionIndex: SeatResolutionIndex,
): number | undefined {
  if (ref.family !== 'perPlayerVar' || ref.selector === undefined) {
    return undefined;
  }
  if (ref.selector.kind === 'player') {
    return ref.selector.player === 'self' ? Number(actingPlayerId) : Number(state.activePlayer);
  }
  const resolvedSeatId = resolvePolicyRoleSelector(def, state, ref.selector, seatId);
  return resolvedSeatId === undefined
    ? undefined
    : resolvePlayerIndexForSeatValue(resolvedSeatId, seatResolutionIndex) ?? undefined;
}

function resolveSeatVarRef(
  state: GameState,
  ref: CompiledCurrentSurfaceRef | CompiledPreviewSurfaceRef,
  playerIndex: number | undefined,
): number | undefined {
  if (ref.family !== 'perPlayerVar' || playerIndex === undefined) {
    return undefined;
  }
  const value = state.perPlayerVars[playerIndex]?.[ref.id];
  return typeof value === 'number' ? value : undefined;
}

function resolveActiveCardEntry(
  def: GameDef,
  state: GameState,
): CompiledCardMetadataEntry | undefined {
  const current = resolveCurrentEventCardState(def, state);
  if (current === null) {
    return undefined;
  }
  return def.cardMetadataIndex?.entries[current.card.id];
}

function resolveActiveCardFamily(
  entry: CompiledCardMetadataEntry,
  family: 'activeCardIdentity' | 'activeCardTag' | 'activeCardMetadata',
  id: string,
): PolicyValue {
  switch (family) {
    case 'activeCardIdentity':
      return id === 'id' ? entry.cardId : id === 'deckId' ? entry.deckId : undefined;
    case 'activeCardTag':
      return entry.tags.includes(id);
    case 'activeCardMetadata':
      return entry.metadata[id];
  }
}
