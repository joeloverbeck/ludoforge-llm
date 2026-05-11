import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import { createSeatResolutionContext } from '../kernel/identity.js';
import type { PlayerId } from '../kernel/branded.js';
import type { EncodedState, EncodedStateLayout } from '../kernel/encoded-state/index.js';
import type {
  AgentParameterValue,
  AgentPreviewInnerCapClass,
  AgentPolicyCatalog,
  ChoicePendingRequest,
  CompiledAgentPolicyRef,
  CompiledAgentProfile,
  CompiledCurrentSurfaceRef,
  CompiledPreviewSurfaceRef,
  GameDef,
  GameState,
  LookupRefStatus,
  MoveParamValue,
  Move,
  TrustedExecutableMove,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import {
  createPolicyPreviewRuntime,
  K_PREVIEW_DEPTH,
  type Phase1ActionPreviewEntry,
  type PolicyPreviewDependencies,
  type PolicyPreviewCompletionMetadata,
  type PolicyPreviewDriveTrace,
  type PolicyPreviewGrantedOperation,
  type PolicyPreviewTraceOutcome,
  type PolicyPreviewSurfaceResolution,
} from './policy-preview.js';
import {
  resolveLookupAgainstState,
  resolveLookupViaSeatResolution,
  type LookupStateSource,
} from './policy-lookup-surface.js';
import {
  buildPolicyVictorySurface,
  getPolicySurfaceVisibility,
  isSurfaceVisibilityAccessible,
  resolveSurfaceRefValue,
  resolvePolicyRoleSelector,
  type PolicyValue,
  type PolicyVictorySurface,
  type SurfaceResolutionContext,
} from './policy-surface.js';

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
  resolveSurface(ref: CompiledCurrentSurfaceRef, stateOverride?: GameState, seatContext?: string): PolicyValue;
}

export interface PolicyPreviewSurfaceProvider {
  markGated(candidate: PolicyRuntimeCandidate): void;
  resolveSurface(
    candidate: PolicyRuntimeCandidate,
    ref: CompiledPreviewSurfaceRef,
    seatContext?: string,
  ): PolicyPreviewSurfaceResolution;
  getPreviewState(candidate: PolicyRuntimeCandidate): GameState | undefined;
  getOutcome(candidate: PolicyRuntimeCandidate): PolicyPreviewTraceOutcome;
  getFailureReason(candidate: PolicyRuntimeCandidate): string | undefined;
  getCompletionMetadata(candidate: PolicyRuntimeCandidate): PolicyPreviewCompletionMetadata | undefined;
  getCompletionPolicyFallbackCount(candidate: PolicyRuntimeCandidate): number;
  getPreviewDrive(candidate: PolicyRuntimeCandidate): PolicyPreviewDriveTrace | undefined;
  getGrantedOperation(candidate: PolicyRuntimeCandidate): PolicyPreviewGrantedOperation | undefined;
  hasPreviewData(candidate: PolicyRuntimeCandidate): boolean;
  hasMaterializedOutcome(candidate: PolicyRuntimeCandidate): boolean;
}

export interface PolicyLookupSurfaceProvider {
  resolveLookup(
    ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>,
    keyValue: PolicyValue,
    seatContext?: string,
  ): LookupRefStatus;
  resolveLookupAgainstState(
    source: LookupStateSource,
    ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>,
    keyValue: PolicyValue,
    seatContext?: string,
  ): LookupRefStatus;
}

export interface PreviewOptionProjectedState {
  readonly state?: GameState;
  readonly outcome: PolicyPreviewTraceOutcome;
  readonly driveDepth: number;
  readonly completionPolicy: PolicyPreviewDriveTrace['completionPolicy'];
  readonly capClass: AgentPreviewInnerCapClass;
}

export interface PolicyCompletionProvider {
  resolveMicroturnIntrinsic(
    intrinsic: Extract<CompiledAgentPolicyRef, { readonly kind: 'microturnIntrinsic' }>['intrinsic'],
  ): PolicyValue;
  resolveMicroturnOptionIntrinsic(
    intrinsic: Extract<CompiledAgentPolicyRef, { readonly kind: 'microturnOptionIntrinsic' }>['intrinsic'],
  ): PolicyValue;
}

export interface PolicyRuntimeProviders {
  readonly intrinsics: PolicyIntrinsicProvider;
  readonly candidates: PolicyCandidateProvider;
  readonly currentSurface: PolicyCurrentSurfaceProvider;
  readonly previewSurface: PolicyPreviewSurfaceProvider;
  readonly lookupSurface: PolicyLookupSurfaceProvider;
  readonly completion?: PolicyCompletionProvider;
  dispose(): void;
}

export interface CreatePolicyRuntimeProvidersInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly seatId: string;
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;
  readonly phase1ActionPreviewIndex?: ReadonlyMap<string, Phase1ActionPreviewEntry>;
  readonly catalog: AgentPolicyCatalog;
  readonly previewDependencies?: PolicyPreviewDependencies;
  readonly runtime?: GameDefRuntime;
  readonly traceLevel?: 'none' | 'summary' | 'verbose';
  readonly encodedStateLayout?: EncodedStateLayout;
  readonly encodedState?: EncodedState;
  readonly completion?: {
    readonly request: ChoicePendingRequest;
    readonly optionValue: MoveParamValue;
    readonly optionIndex?: number;
  };
  readonly runtimeError: (code: string, message: string, detail?: Readonly<Record<string, unknown>>) => Error;
}

const hasBit = (array: BigUint64Array, bitIndex: number): boolean => {
  const word = Math.trunc(bitIndex / 64);
  const offset = BigInt(bitIndex % 64);
  return ((array[word] ?? 0n) & (1n << offset)) !== 0n;
};

function resolveEncodedCurrentSurface(
  input: CreatePolicyRuntimeProvidersInput,
  ref: CompiledCurrentSurfaceRef,
  state: GameState,
  targetPlayerIndex: number | undefined,
): PolicyValue | undefined {
  const layout = input.encodedStateLayout;
  const encoded = input.encodedState;
  if (state !== input.state || layout === undefined || encoded === undefined) {
    return undefined;
  }
  if (ref.family === 'globalVar') {
    const index = layout.varLayout.globalVariableIds.indexOf(ref.id);
    return index < 0 ? undefined : encoded.globals[index];
  }
  if (ref.family === 'perPlayerVar') {
    const varIndex = layout.varLayout.perPlayerVariableIds.indexOf(ref.id);
    if (targetPlayerIndex === undefined || varIndex < 0) {
      return undefined;
    }
    return encoded.playerInts[targetPlayerIndex * layout.varLayout.perPlayerVariableIds.length + varIndex];
  }
  if (ref.family === 'globalMarker') {
    const markerStates = layout.markerLayout.markerStateIdsByMarkerId[ref.id];
    if (markerStates === undefined) {
      return undefined;
    }
    let bitOffset = 0;
    for (const markerId of layout.markerLayout.globalMarkerIds) {
      if (markerId === ref.id) {
        for (const [stateOffset, stateId] of markerStates.entries()) {
          if (hasBit(encoded.globalMarkers, bitOffset + stateOffset)) {
            return stateId;
          }
        }
        const lattice = input.def.globalMarkerLattices?.find((entry) => entry.id === ref.id);
        return lattice?.defaultState;
      }
      bitOffset += layout.markerLayout.markerStateIdsByMarkerId[markerId]?.length ?? 0;
    }
  }
  return undefined;
}

export function createPolicyRuntimeProviders(input: CreatePolicyRuntimeProvidersInput): PolicyRuntimeProviders {
  const seatResolutionIndex = createSeatResolutionContext(input.def, input.state.playerCount).index;
  const activeProfileId = input.catalog.bindingsBySeat[input.seatId];
  const activeProfile = activeProfileId !== undefined ? input.catalog.profiles[activeProfileId] : undefined;
  const observerName = activeProfile?.observerName ?? input.def.observers?.defaultObserverName;
  const observerProfile = observerName === undefined ? undefined : input.def.observers?.observers[observerName];
  const profileHasMicroturnConsiderations = activeProfile !== undefined
    && hasMicroturnScopedConsideration(input.catalog, activeProfile);
  const previewRuntime = createPolicyPreviewRuntime({
    def: input.def,
    state: input.state,
    playerId: input.playerId,
    seatId: input.seatId,
    trustedMoveIndex: input.trustedMoveIndex,
    ...(input.phase1ActionPreviewIndex === undefined ? {} : { phase1ActionPreviewIndex: input.phase1ActionPreviewIndex }),
    previewMode: activeProfile?.preview.mode ?? 'exactWorld',
    completionPolicy: activeProfile?.preview.completion ?? 'greedy',
    fallbackCompletionPolicy: activeProfile?.preview.fallbackCompletionPolicy ?? 'greedy',
    completionDepthCap: activeProfile?.preview.completionDepthCap ?? K_PREVIEW_DEPTH,
    captureSyntheticDecisions: input.traceLevel === 'verbose',
    ...(profileHasMicroturnConsiderations
      ? { policyGuidedDeps: { catalog: input.catalog, profile: activeProfile! } }
      : {}),
    ...(input.previewDependencies === undefined ? {} : { dependencies: input.previewDependencies }),
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
  });
  const rootStateHash = input.state.stateHash;
  const rootMetricCache = new Map<string, number>();
  let transientMetricCache: { readonly stateHash: bigint; readonly cache: Map<string, number> } | null = null;
  let rootVictorySurface: PolicyVictorySurface | null = null;
  let transientVictorySurface: { readonly stateHash: bigint; readonly surface: PolicyVictorySurface } | null = null;

  function getMetricCache(state: GameState): Map<string, number> {
    if (state.stateHash === rootStateHash) {
      return rootMetricCache;
    }
    if (transientMetricCache?.stateHash === state.stateHash) {
      return transientMetricCache.cache;
    }
    const cache = new Map<string, number>();
    transientMetricCache = { stateHash: state.stateHash, cache };
    return cache;
  }

  function getVictorySurface(state: GameState): PolicyVictorySurface {
    if (state.stateHash === rootStateHash) {
      if (rootVictorySurface === null) {
        rootVictorySurface = buildPolicyVictorySurface(input.def, state, input.runtime);
      }
      return rootVictorySurface;
    }
    if (transientVictorySurface?.stateHash === state.stateHash) {
      return transientVictorySurface.surface;
    }
    const surface = buildPolicyVictorySurface(input.def, state, input.runtime);
    transientVictorySurface = { stateHash: state.stateHash, surface };
    return surface;
  }

  const surfaceContext: SurfaceResolutionContext = {
    def: input.def,
    seatResolutionIndex,
    resolveDerivedMetric(state, metricId) {
      const metricCache = getMetricCache(state);
      if (metricCache.has(metricId)) {
        return metricCache.get(metricId)!;
      }
      const value = computeDerivedMetricValue(input.def, state, metricId);
      metricCache.set(metricId, value);
      return value;
    },
    resolveVictorySurface(state) {
      return getVictorySurface(state);
    },
  };
  let disposed = false;
  const lookupContext = {
    def: input.def,
    state: input.state,
    actingSeatId: input.seatId,
    actingPlayerIndex: Number(input.playerId),
    seatResolutionIndex,
    surfaceVisibility: input.catalog.surfaceVisibility,
    ...(observerProfile === undefined ? {} : { observerProfile }),
  };

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
      resolveSurface(ref, stateOverride, seatContext) {
        const state = stateOverride ?? input.state;
        const visibility = getPolicySurfaceVisibility(input.catalog.surfaceVisibility, ref);
        if (visibility === null) {
          throw input.runtimeError(
            'UNSUPPORTED_RUNTIME_REF',
            `Policy runtime ref "${ref.family}:${ref.id}" is unsupported by the non-preview evaluator runtime.`,
            { ref },
          );
        }
        const targetPlayerIndex = ref.family === 'perPlayerVar' && ref.selector !== undefined
          ? ref.selector.kind === 'player'
            ? ref.selector.player === 'self' ? Number(input.playerId) : Number(state.activePlayer)
            : (() => {
              const resolvedSeatId = resolvePolicyRoleSelector(input.def, state, ref.selector, input.seatId, seatContext);
              return resolvedSeatId === undefined
                ? undefined
                : seatResolutionIndex.playerIndexBySeatId.get(resolvedSeatId);
              })()
          : undefined;
        const resolvedSeatId = ref.selector?.kind !== 'role'
          ? undefined
          : resolvePolicyRoleSelector(input.def, state, ref.selector, input.seatId, seatContext);
        if (!isSurfaceVisibilityAccessible(
          visibility.current,
          input.seatId,
          resolvedSeatId,
          Number(input.playerId),
          targetPlayerIndex,
        )) {
          return undefined;
        }
        try {
          const encodedValue = resolveEncodedCurrentSurface(input, ref, state, targetPlayerIndex);
          if (encodedValue !== undefined) {
            return encodedValue;
          }
          return resolveSurfaceRefValue(state, ref, input.seatId, input.playerId, surfaceContext, seatContext);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown runtime surface evaluation failure.';
          const code = message === 'victory.currentMargin/currentRank refs require def.terminal.margins to be defined.'
            ? 'UNSUPPORTED_RUNTIME_REF'
            : 'RUNTIME_EVALUATION_ERROR';
          throw input.runtimeError(
            code,
            message,
          );
        }
      },
    },
    previewSurface: {
      markGated(candidate) {
        previewRuntime.markGated(candidate);
      },
      resolveSurface(candidate, ref, seatContext) {
        return previewRuntime.resolveSurface(candidate, ref, seatContext);
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
      getCompletionMetadata(candidate) {
        return previewRuntime.getCompletionMetadata(candidate);
      },
      getCompletionPolicyFallbackCount(candidate) {
        return previewRuntime.getCompletionPolicyFallbackCount(candidate);
      },
      getPreviewDrive(candidate) {
        return previewRuntime.getPreviewDrive(candidate);
      },
      getGrantedOperation(candidate) {
        return previewRuntime.getGrantedOperation(candidate);
      },
      hasPreviewData(candidate) {
        return previewRuntime.hasPreviewData(candidate);
      },
      hasMaterializedOutcome(candidate) {
        return previewRuntime.hasMaterializedOutcome(candidate);
      },
    },
    lookupSurface: {
      resolveLookup(ref, keyValue, seatContext) {
        return resolveLookupViaSeatResolution(lookupContext, ref, keyValue, seatContext);
      },
      resolveLookupAgainstState(source, ref, keyValue, seatContext) {
        return resolveLookupAgainstState(lookupContext, source, ref, keyValue, seatContext);
      },
    },
    ...(input.completion === undefined
      ? {}
      : {
          completion: createPolicyCompletionProvider(
            input.completion.request,
            input.completion.optionValue,
            input.completion.optionIndex,
          ),
        }),
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      previewRuntime.dispose();
      rootMetricCache.clear();
      transientMetricCache?.cache.clear();
      transientMetricCache = null;
      rootVictorySurface = null;
      transientVictorySurface = null;
    },
  };
}

// Memoize: a profile's set of microturn-scoped considerations is fixed across
// a benchmark run. Per-call recomputation otherwise iterates `profile.use.considerations`
// inside every `createPolicyRuntimeProviders` call (~50 outer microturns + several
// per-pick scoring contexts). When the result is empty the policyGuided picker
// becomes a no-op — callers can short-circuit allocation of pending-request
// objects entirely.
const profileHasMicroturnCache = new WeakMap<CompiledAgentProfile, boolean>();

export function hasMicroturnScopedConsideration(
  catalog: AgentPolicyCatalog,
  profile: CompiledAgentProfile,
): boolean {
  const cached = profileHasMicroturnCache.get(profile);
  if (cached !== undefined) {
    return cached;
  }
  const considerations = catalog.compiled.considerations;
  const result = (profile.use.considerations ?? []).some(
    (id) => considerations[id]?.scopes?.includes('microturn') === true,
  );
  profileHasMicroturnCache.set(profile, result);
  return result;
}

export function createPolicyCompletionProvider(
  request: ChoicePendingRequest,
  optionValue: MoveParamValue,
  optionIndex = request.options.findIndex((option) => Object.is(option.value, optionValue)),
): PolicyCompletionProvider {
  const normalizedOptionValue = normalizeCompletionOptionValue(optionValue);
  const normalizedStableKey = JSON.stringify(normalizedOptionValue);
  return {
    resolveMicroturnIntrinsic(intrinsic) {
      switch (intrinsic) {
        case 'kind':
          return request.type;
        case 'decisionKey':
          return String(request.decisionKey);
        case 'actorSeat':
          return request.decisionPlayer ?? 'unknown';
        case 'remainingRequiredCount':
          return request.type === 'chooseN' ? Math.max((request.min ?? 0) - request.selected.length, 0) : 1;
        case 'remainingMaxCount': {
          if (request.type !== 'chooseN') return 1;
          const optionCount = request.options.length;
          const max = Math.min(request.max ?? optionCount, optionCount);
          return Math.max(max - request.selected.length, 0);
        }
      }
    },
    resolveMicroturnOptionIntrinsic(intrinsic) {
      switch (intrinsic) {
        case 'value':
          return normalizedOptionValue;
        case 'index':
          return optionIndex;
        case 'stableKey':
          return normalizedStableKey;
        case 'tags':
          return [];
        case 'targetKind':
          return request.targetKinds[0] ?? 'unknown';
      }
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
