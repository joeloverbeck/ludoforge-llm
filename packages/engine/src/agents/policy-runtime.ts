import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import { createSeatResolutionContext } from '../kernel/identity.js';
import type { PlayerId } from '../kernel/branded.js';
import type {
  AgentParameterValue,
  AgentPolicyCatalog,
  ChoicePendingRequest,
  CompiledAgentPolicyRef,
  CompiledAgentProfile,
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
  type Phase1ActionPreviewEntry,
  type PolicyPreviewDependencies,
  type PolicyPreviewCompletionMetadata,
  type PolicyPreviewGrantedOperation,
  type PolicyPreviewTraceOutcome,
  type PolicyPreviewSurfaceResolution,
} from './policy-preview.js';
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
  getGrantedOperation(candidate: PolicyRuntimeCandidate): PolicyPreviewGrantedOperation | undefined;
  hasPreviewData(candidate: PolicyRuntimeCandidate): boolean;
  hasMaterializedOutcome(candidate: PolicyRuntimeCandidate): boolean;
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
  readonly completion?: {
    readonly request: ChoicePendingRequest;
    readonly optionValue: MoveParamValue;
  };
  readonly runtimeError: (code: string, message: string, detail?: Readonly<Record<string, unknown>>) => Error;
}

export function createPolicyRuntimeProviders(input: CreatePolicyRuntimeProvidersInput): PolicyRuntimeProviders {
  const seatResolutionIndex = createSeatResolutionContext(input.def, input.state.playerCount).index;
  const activeProfileId = input.catalog.bindingsBySeat[input.seatId];
  const activeProfile = activeProfileId !== undefined ? input.catalog.profiles[activeProfileId] : undefined;
  const profileHasCompletionConsiderations = activeProfile !== undefined
    && hasCompletionScopedConsideration(input.catalog, activeProfile);
  const previewRuntime = createPolicyPreviewRuntime({
    def: input.def,
    state: input.state,
    playerId: input.playerId,
    seatId: input.seatId,
    trustedMoveIndex: input.trustedMoveIndex,
    ...(input.phase1ActionPreviewIndex === undefined ? {} : { phase1ActionPreviewIndex: input.phase1ActionPreviewIndex }),
    previewMode: activeProfile?.preview.mode ?? 'exactWorld',
    completionPolicy: activeProfile?.preview.completion ?? 'greedy',
    completionDepthCap: activeProfile?.preview.completionDepthCap ?? 8,
    ...(profileHasCompletionConsiderations
      ? { agentGuidedDeps: { catalog: input.catalog, profile: activeProfile! } }
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
    ...(input.completion === undefined
      ? {}
      : {
          completion: createPolicyCompletionProvider(
            input.completion.request,
            input.completion.optionValue,
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

// Memoize: a profile's set of completion-scoped considerations is fixed across
// a benchmark run. Per-call recomputation otherwise iterates `profile.use.considerations`
// inside every `createPolicyRuntimeProviders` call (~50 outer microturns + several
// per-pick scoring contexts). When the result is empty the agentGuided picker
// becomes a no-op — callers can short-circuit allocation of pending-request
// objects entirely.
const profileHasCompletionCache = new WeakMap<CompiledAgentProfile, boolean>();

function hasCompletionScopedConsideration(
  catalog: AgentPolicyCatalog,
  profile: CompiledAgentProfile,
): boolean {
  const cached = profileHasCompletionCache.get(profile);
  if (cached !== undefined) {
    return cached;
  }
  const considerations = catalog.compiled.considerations;
  const result = (profile.use.considerations ?? []).some(
    (id) => considerations[id]?.scopes?.includes('completion') === true,
  );
  profileHasCompletionCache.set(profile, result);
  return result;
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
