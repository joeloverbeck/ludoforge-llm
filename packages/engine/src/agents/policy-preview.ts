import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import { resolveCurrentEventCardState } from '../kernel/event-execution.js';
import { derivePlayerObservation } from '../kernel/observation.js';
import { applyTrustedMove } from '../kernel/apply-move.js';
import { buildSeatResolutionIndex, resolvePlayerIndexForSeatValue, type SeatResolutionIndex } from '../kernel/identity.js';
import { classifyPlayableMoveCandidate, type PlayableCandidateClassification } from '../kernel/playable-candidate.js';
import type { PlayerId } from '../kernel/branded.js';
import type {
  CompiledAgentPolicyPreviewSurfaceRef,
  CompiledCardMetadataEntry,
  GameDef,
  GameState,
  Move,
  RngState,
  TrustedExecutableMove,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import {
  buildPolicyVictorySurface,
  getPolicySurfaceVisibility,
  isSurfaceVisibilityAccessible,
  resolvePolicyRoleSelector,
  type PolicyVictorySurface,
} from './policy-surface.js';
import { extractAnnotationValue as extractAnnotationValueForPreview } from './policy-annotation-resolve.js';

export interface PolicyPreviewCandidate {
  readonly move: Move;
  readonly stableMoveKey: string;
}

export interface PolicyPreviewDependencies {
  readonly classifyPlayableMoveCandidate?: (
    def: GameDef,
    state: GameState,
    move: Move,
    runtime?: GameDefRuntime,
  ) => PlayableCandidateClassification;
  readonly applyMove?: (
    def: GameDef,
    state: GameState,
    move: import('../kernel/types.js').TrustedExecutableMove,
    options?: undefined,
    runtime?: GameDefRuntime,
  ) => { readonly state: GameState };
  readonly derivePlayerObservation?: typeof derivePlayerObservation;
  readonly computeDerivedMetricValue?: typeof computeDerivedMetricValue;
}

export interface CreatePolicyPreviewRuntimeInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly seatId: string;
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;
  readonly runtime?: GameDefRuntime;
  readonly dependencies?: PolicyPreviewDependencies;
  readonly tolerateRngDivergence?: boolean;
}

export interface PolicyPreviewRuntime {
  resolveSurface(
    candidate: PolicyPreviewCandidate,
    ref: CompiledAgentPolicyPreviewSurfaceRef,
  ): PolicyPreviewSurfaceResolution;
  getOutcome(candidate: PolicyPreviewCandidate): PolicyPreviewTraceOutcome;
}

export type PolicyPreviewUnavailabilityReason = 'random' | 'hidden' | 'unresolved' | 'failed';
export type PolicyPreviewTraceOutcome = 'ready' | 'stochastic' | PolicyPreviewUnavailabilityReason;

export type PolicyPreviewSurfaceResolution =
  | {
      readonly kind: 'value';
      readonly value: number;
    }
  | {
      readonly kind: 'unknown';
      readonly reason: PolicyPreviewUnavailabilityReason;
    }
  | {
      readonly kind: 'unavailable';
    };

type PreviewOutcome =
  | {
      readonly kind: 'ready';
      readonly state: GameState;
      readonly requiresHiddenSampling: boolean;
      readonly metricCache: Map<string, number>;
      victorySurface: PolicyVictorySurface | null;
    }
  | {
      readonly kind: 'stochastic';
      readonly state: GameState;
      readonly requiresHiddenSampling: boolean;
      readonly metricCache: Map<string, number>;
      victorySurface: PolicyVictorySurface | null;
    }
  | {
      readonly kind: 'unknown';
      readonly reason: PolicyPreviewUnavailabilityReason;
    };

const defaultDependencies = {
  classifyPlayableMoveCandidate,
  applyMove: applyTrustedMove,
  derivePlayerObservation,
  computeDerivedMetricValue,
} satisfies Required<PolicyPreviewDependencies>;

export function createPolicyPreviewRuntime(input: CreatePolicyPreviewRuntimeInput): PolicyPreviewRuntime {
  const deps = {
    ...defaultDependencies,
    ...input.dependencies,
  } satisfies Required<PolicyPreviewDependencies>;
  const cache = new Map<string, PreviewOutcome>();
  const seatResolutionIndex = buildSeatResolutionIndex(input.def, input.state.playerCount);

  return {
    resolveSurface(candidate, ref) {
      const preview = getPreviewOutcome(candidate);
      if (preview.kind !== 'ready' && preview.kind !== 'stochastic') {
        return preview;
      }
      const visibility = input.def.agents === undefined ? null : getPolicySurfaceVisibility(input.def.agents.surfaceVisibility, ref);
      if (visibility === null) {
        return { kind: 'unavailable' };
      }
      const targetPlayerIndex = ref.family === 'perPlayerVar'
        ? resolvePerPlayerTargetIndex(input.def, preview.state, ref, input.playerId, input.seatId, seatResolutionIndex)
        : undefined;
      const resolvedSeatId = ref.selector?.kind !== 'role'
        ? undefined
        : resolvePolicyRoleSelector(input.def, preview.state, ref.selector, input.seatId);
      if (!isSurfaceVisibilityAccessible(
        visibility.preview.visibility,
        input.seatId,
        resolvedSeatId,
        Number(input.playerId),
        targetPlayerIndex,
      )) {
        return { kind: 'unavailable' };
      }
      if (preview.requiresHiddenSampling && !visibility.preview.allowWhenHiddenSampling) {
        return { kind: 'unknown', reason: 'hidden' };
      }
      if (ref.family === 'derivedMetric') {
        const cachedValue = preview.metricCache.get(ref.id);
        if (cachedValue !== undefined) {
          return { kind: 'value', value: cachedValue };
        }
        const value = deps.computeDerivedMetricValue(input.def, preview.state, ref.id);
        preview.metricCache.set(ref.id, value);
        return { kind: 'value', value };
      }
      if (ref.family === 'globalVar') {
        const value = preview.state.globalVars[ref.id];
        return typeof value === 'number' ? { kind: 'value', value } : { kind: 'unavailable' };
      }
      if (ref.family === 'perPlayerVar') {
        const value = resolveSeatVarRef(preview.state, ref, targetPlayerIndex);
        return typeof value === 'number' ? { kind: 'value', value } : { kind: 'unavailable' };
      }
      if (ref.family === 'victoryCurrentMargin') {
        if (ref.selector?.kind !== 'role') {
          return { kind: 'unavailable' };
        }
        const value = getVictorySurface(input.def, preview, input.runtime).marginBySeat.get(
          resolvePolicyRoleSelector(input.def, preview.state, ref.selector, input.seatId),
        );
        return typeof value === 'number' ? { kind: 'value', value } : { kind: 'unavailable' };
      }
      if (ref.family === 'victoryCurrentRank') {
        if (ref.selector?.kind !== 'role') {
          return { kind: 'unavailable' };
        }
        const value = getVictorySurface(input.def, preview, input.runtime).rankBySeat.get(
          resolvePolicyRoleSelector(input.def, preview.state, ref.selector, input.seatId),
        );
        return typeof value === 'number' ? { kind: 'value', value } : { kind: 'unavailable' };
      }
      if (ref.family === 'activeCardAnnotation') {
        const current = resolveCurrentEventCardState(input.def, preview.state);
        if (current === null) {
          return { kind: 'unavailable' };
        }
        const annotation = input.def.cardAnnotationIndex?.entries[current.card.id];
        if (annotation === undefined) {
          return { kind: 'unavailable' };
        }
        const previewActiveSeatId = input.def.seats?.[preview.state.activePlayer]?.id;
        const resolved = extractAnnotationValueForPreview(annotation, ref, input.seatId, previewActiveSeatId);
        if (resolved === undefined) {
          return { kind: 'unavailable' };
        }
        return typeof resolved === 'number'
          ? { kind: 'value', value: resolved }
          : typeof resolved === 'boolean'
            ? { kind: 'value', value: resolved ? 1 : 0 }
            : { kind: 'unavailable' };
      }
      if (ref.family === 'activeCardIdentity' || ref.family === 'activeCardTag' || ref.family === 'activeCardMetadata') {
        const entry = resolveActiveCardEntryFromState(input.def, preview.state);
        if (entry === undefined) {
          return { kind: 'unavailable' };
        }
        const resolved = resolveActiveCardFamilyValue(entry, ref.family, ref.id);
        if (resolved === undefined) {
          return { kind: 'unavailable' };
        }
        return typeof resolved === 'number'
          ? { kind: 'value', value: resolved }
          : typeof resolved === 'boolean'
            ? { kind: 'value', value: resolved ? 1 : 0 }
            : typeof resolved === 'string'
              ? { kind: 'value', value: 0 }
              : { kind: 'unavailable' };
      }
      return { kind: 'unavailable' };
    },
    getOutcome(candidate) {
      return toPreviewTraceOutcome(getPreviewOutcome(candidate));
    },
  };

  function getPreviewOutcome(candidate: PolicyPreviewCandidate): PreviewOutcome {
    const cached = cache.get(candidate.stableMoveKey);
    if (cached !== undefined) {
      return cached;
    }

    const trustedMove = input.trustedMoveIndex.get(candidate.stableMoveKey);
    const outcome = trustedMove === undefined
      ? classifyPreviewOutcome(deps.classifyPlayableMoveCandidate(input.def, input.state, candidate.move, input.runtime))
      : tryApplyPreview(trustedMove);
    cache.set(candidate.stableMoveKey, outcome);
    return outcome;
  }

  function classifyPreviewOutcome(classification: PlayableCandidateClassification): PreviewOutcome {
    if (classification.kind !== 'playableComplete') {
      return { kind: 'unknown', reason: 'unresolved' };
    }

    return tryApplyPreview(classification.move);
  }

  function tryApplyPreview(trustedMove: TrustedExecutableMove): PreviewOutcome {
    if (trustedMove.sourceStateHash !== input.state.stateHash) {
      return { kind: 'unknown', reason: 'failed' };
    }

    const tolerateRng = input.tolerateRngDivergence === true;

    try {
      const previewState = deps.applyMove(
        input.def,
        input.state,
        trustedMove,
        undefined,
        input.runtime,
      ).state;
      const rngDiverged = !rngStatesEqual(previewState.rng, input.state.rng);

      if (rngDiverged && !tolerateRng) {
        return { kind: 'unknown', reason: 'random' };
      }

      const observation = deps.derivePlayerObservation(input.def, previewState, input.playerId);
      return {
        kind: rngDiverged ? 'stochastic' : 'ready',
        state: previewState,
        requiresHiddenSampling: observation.requiresHiddenSampling,
        metricCache: new Map<string, number>(),
        victorySurface: null,
      };
    } catch {
      return { kind: 'unknown', reason: 'failed' };
    }
  }
}

function toPreviewTraceOutcome(outcome: PreviewOutcome): PolicyPreviewTraceOutcome {
  return outcome.kind === 'ready' ? 'ready' : outcome.kind === 'stochastic' ? 'stochastic' : outcome.reason;
}

function resolvePerPlayerTargetIndex(
  def: GameDef,
  state: GameState,
  ref: CompiledAgentPolicyPreviewSurfaceRef,
  actingPlayerId: PlayerId,
  seatId: string,
  seatResolutionIndex: SeatResolutionIndex,
): number | undefined {
  if (ref.family !== 'perPlayerVar' || ref.selector === undefined) {
    return undefined;
  }
  return ref.selector.kind === 'player'
    ? (ref.selector.player === 'self' ? Number(actingPlayerId) : Number(state.activePlayer))
    : resolvePlayerIndexForSeatValue(resolvePolicyRoleSelector(def, state, ref.selector, seatId), seatResolutionIndex) ?? undefined;
}

function resolveActiveCardEntryFromState(
  def: GameDef,
  state: GameState,
): CompiledCardMetadataEntry | undefined {
  const current = resolveCurrentEventCardState(def, state);
  if (current === null) {
    return undefined;
  }
  return def.cardMetadataIndex?.entries[current.card.id];
}

function resolveActiveCardFamilyValue(
  entry: CompiledCardMetadataEntry,
  family: 'activeCardIdentity' | 'activeCardTag' | 'activeCardMetadata',
  id: string,
): string | number | boolean | undefined {
  switch (family) {
    case 'activeCardIdentity':
      return id === 'id' ? entry.cardId : id === 'deckId' ? entry.deckId : undefined;
    case 'activeCardTag':
      return entry.tags.includes(id);
    case 'activeCardMetadata':
      return entry.metadata[id];
  }
}

function resolveSeatVarRef(
  state: GameState,
  ref: CompiledAgentPolicyPreviewSurfaceRef,
  playerIndex: number | undefined,
): number | undefined {
  if (ref.family !== 'perPlayerVar' || playerIndex === undefined) {
    return undefined;
  }
  const value = state.perPlayerVars[playerIndex]?.[ref.id];
  return typeof value === 'number' ? value : undefined;
}

function getVictorySurface(
  def: GameDef,
  preview: Extract<PreviewOutcome, { readonly kind: 'ready' } | { readonly kind: 'stochastic' }>,
  runtime?: GameDefRuntime,
): PolicyVictorySurface {
  if (preview.victorySurface !== null) {
    return preview.victorySurface;
  }
  preview.victorySurface = buildPolicyVictorySurface(def, preview.state, runtime);
  return preview.victorySurface;
}

function rngStatesEqual(left: RngState, right: RngState): boolean {
  return left.algorithm === right.algorithm
    && left.version === right.version
    && left.state.length === right.state.length
    && left.state.every((entry, index) => entry === right.state[index]);
}
