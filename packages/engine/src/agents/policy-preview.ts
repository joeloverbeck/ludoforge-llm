import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import { derivePlayerObservation } from '../kernel/observation.js';
import { applyTrustedMove } from '../kernel/apply-move.js';
import { buildSeatResolutionIndex } from '../kernel/identity.js';
import { classifyPlayableMoveCandidate, type PlayableCandidateClassification } from '../kernel/playable-candidate.js';
import type { PlayerId, ZoneId } from '../kernel/branded.js';
import type {
  AgentPreviewMode,
  CompiledPreviewSurfaceRef,
  ExecutionOptions,
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
  resolveSurfaceRefValue,
  type PolicyValue,
  type PolicyVictorySurface,
  type SurfaceResolutionContext,
} from './policy-surface.js';

export interface PolicyPreviewCandidate {
  readonly move: Move;
  readonly stableMoveKey: string;
  readonly actionId?: string;
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
    options?: ExecutionOptions,
    runtime?: GameDefRuntime,
  ) => { readonly state: GameState };
  readonly derivePlayerObservation?: typeof derivePlayerObservation;
  readonly evaluateGrantedOperation?: (
    def: GameDef,
    postEventState: GameState,
    agentSeatId: string,
    runtime?: GameDefRuntime,
  ) => { move: Move; score: number } | undefined;
  readonly computeDerivedMetricValue?: typeof computeDerivedMetricValue;
}

export interface Phase1ActionPreviewEntry {
  readonly actionId: string;
  readonly trustedMove: TrustedExecutableMove;
}

export interface CreatePolicyPreviewRuntimeInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly seatId: string;
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;
  readonly phase1ActionPreviewIndex?: ReadonlyMap<string, Phase1ActionPreviewEntry>;
  readonly runtime?: GameDefRuntime;
  readonly dependencies?: PolicyPreviewDependencies;
  readonly previewMode: AgentPreviewMode;
}

export interface PolicyPreviewRuntime {
  resolveSurface(
    candidate: PolicyPreviewCandidate,
    ref: CompiledPreviewSurfaceRef,
    seatContext?: string,
  ): PolicyPreviewSurfaceResolution;
  getPreviewState(candidate: PolicyPreviewCandidate): GameState | undefined;
  getOutcome(candidate: PolicyPreviewCandidate): PolicyPreviewTraceOutcome;
  getFailureReason(candidate: PolicyPreviewCandidate): string | undefined;
  getGrantedOperation(candidate: PolicyPreviewCandidate): PolicyPreviewGrantedOperation | undefined;
  hasPreviewData(candidate: PolicyPreviewCandidate): boolean;
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
      readonly failureReason?: string;
    }
  | {
      readonly kind: 'unavailable';
    };

export interface PolicyPreviewGrantedOperation {
  readonly move: Move;
  readonly score: number;
  readonly preEventMargin?: number;
  readonly postEventPlusOpMargin?: number;
}

type PreviewOutcome =
  | {
      readonly kind: 'ready';
      readonly state: GameState;
      readonly hiddenSamplingZones: readonly ZoneId[];
      readonly metricCache: Map<string, number>;
      victorySurface: PolicyVictorySurface | null;
      readonly grantedOperation?: PolicyPreviewGrantedOperation;
    }
  | {
      readonly kind: 'stochastic';
      readonly state: GameState;
      readonly hiddenSamplingZones: readonly ZoneId[];
      readonly metricCache: Map<string, number>;
      victorySurface: PolicyVictorySurface | null;
      readonly grantedOperation?: PolicyPreviewGrantedOperation;
    }
  | {
      readonly kind: 'unknown';
      readonly reason: PolicyPreviewUnavailabilityReason;
      readonly failureReason?: string;
    };

const defaultDependencies = {
  classifyPlayableMoveCandidate,
  applyMove: applyPreviewMove,
  derivePlayerObservation,
  evaluateGrantedOperation: () => undefined,
  computeDerivedMetricValue,
} satisfies Required<PolicyPreviewDependencies>;

export function applyPreviewMove(
  def: GameDef,
  state: GameState,
  move: TrustedExecutableMove,
  options: ExecutionOptions = { advanceToDecisionPoint: false },
  runtime?: GameDefRuntime,
): { readonly state: GameState } {
  return applyTrustedMove(def, state, move, options, runtime);
}

export function createPolicyPreviewRuntime(input: CreatePolicyPreviewRuntimeInput): PolicyPreviewRuntime {
  const deps = {
    ...defaultDependencies,
    ...input.dependencies,
  } satisfies Required<PolicyPreviewDependencies>;
  const cache = new Map<string, PreviewOutcome>();
  const seatResolutionIndex = buildSeatResolutionIndex(input.def, input.state.playerCount);
  const surfaceContext: SurfaceResolutionContext = {
    def: input.def,
    seatResolutionIndex,
    resolveDerivedMetric(state, metricId) {
      return deps.computeDerivedMetricValue(input.def, state, metricId);
    },
    resolveVictorySurface(state) {
      return buildPolicyVictorySurface(input.def, state, input.runtime);
    },
  };

  return {
    resolveSurface(candidate, ref, seatContext) {
      const preview = getPreviewOutcome(candidate);
      if (preview.kind !== 'ready' && preview.kind !== 'stochastic') {
        return preview;
      }
      const visibility = input.def.agents === undefined ? null : getPolicySurfaceVisibility(input.def.agents.surfaceVisibility, ref);
      if (visibility === null) {
        return { kind: 'unavailable' };
      }
      const targetPlayerIndex = ref.family === 'perPlayerVar' && ref.selector !== undefined
        ? ref.selector.kind === 'player'
          ? ref.selector.player === 'self' ? Number(input.playerId) : Number(preview.state.activePlayer)
          : (() => {
              const resolvedSeatId = resolvePolicyRoleSelector(input.def, preview.state, ref.selector, input.seatId, seatContext);
              return resolvedSeatId === undefined
                ? undefined
                : seatResolutionIndex.playerIndexBySeatId.get(resolvedSeatId);
            })()
        : undefined;
      const resolvedSeatId = ref.selector?.kind !== 'role'
        ? undefined
        : resolvePolicyRoleSelector(input.def, preview.state, ref.selector, input.seatId, seatContext);
      if (!isSurfaceVisibilityAccessible(
        visibility.preview.visibility,
        input.seatId,
        resolvedSeatId,
        Number(input.playerId),
        targetPlayerIndex,
      )) {
        return { kind: 'unavailable' };
      }
      if (preview.hiddenSamplingZones.length > 0 && !visibility.preview.allowWhenHiddenSampling) {
        return { kind: 'unknown', reason: 'hidden' };
      }
      let resolved: PolicyValue;
      try {
        resolved = resolveSurfaceRefValue(preview.state, ref, input.seatId, input.playerId, {
          ...surfaceContext,
          resolveDerivedMetric(state, metricId) {
            const cachedValue = preview.metricCache.get(metricId);
            if (cachedValue !== undefined) {
              return cachedValue;
            }
            const value = deps.computeDerivedMetricValue(input.def, state, metricId);
            preview.metricCache.set(metricId, value);
            return value;
          },
          resolveVictorySurface(state) {
            if (state === preview.state) {
              return getVictorySurface(input.def, preview, input.runtime);
            }
            return buildPolicyVictorySurface(input.def, state, input.runtime);
          },
        }, seatContext);
      } catch {
        return { kind: 'unavailable' };
      }
      if (resolved === undefined || ref.family === 'globalMarker') {
        return { kind: 'unavailable' };
      }
      return typeof resolved === 'number'
        ? { kind: 'value', value: resolved }
        : typeof resolved === 'boolean'
          ? { kind: 'value', value: resolved ? 1 : 0 }
          : typeof resolved === 'string'
            ? { kind: 'value', value: 0 }
            : { kind: 'unavailable' };
    },
    getPreviewState(candidate) {
      const outcome = getPreviewOutcome(candidate);
      return outcome.kind === 'ready' || outcome.kind === 'stochastic'
        ? outcome.state
        : undefined;
    },
    getOutcome(candidate) {
      return toPreviewTraceOutcome(getPreviewOutcome(candidate));
    },
    getFailureReason(candidate) {
      const outcome = getPreviewOutcome(candidate);
      return outcome.kind === 'unknown' ? outcome.failureReason : undefined;
    },
    getGrantedOperation(candidate) {
      const outcome = getPreviewOutcome(candidate);
      return outcome.kind === 'ready' || outcome.kind === 'stochastic'
        ? outcome.grantedOperation
        : undefined;
    },
    hasPreviewData(candidate) {
      const candidateActionId = candidate.actionId ?? String(candidate.move.actionId);
      return input.trustedMoveIndex.has(candidate.stableMoveKey)
        || input.phase1ActionPreviewIndex?.has(candidateActionId) === true;
    },
  };

  function getPreviewOutcome(candidate: PolicyPreviewCandidate): PreviewOutcome {
    const cached = cache.get(candidate.stableMoveKey);
    if (cached !== undefined) {
      return cached;
    }
    if (input.previewMode === 'disabled') {
      const disabledOutcome: PreviewOutcome = { kind: 'unknown', reason: 'failed' };
      cache.set(candidate.stableMoveKey, disabledOutcome);
      return disabledOutcome;
    }

    const trustedMove = input.trustedMoveIndex.get(candidate.stableMoveKey);
    const candidateActionId = candidate.actionId ?? String(candidate.move.actionId);
    const representativeTrustedMove = input.phase1ActionPreviewIndex?.get(candidateActionId)?.trustedMove;
    const outcome = trustedMove !== undefined
      ? tryApplyPreview(trustedMove)
      : representativeTrustedMove !== undefined
        ? tryApplyPreview(representativeTrustedMove)
        : classifyPreviewOutcome(deps.classifyPlayableMoveCandidate(input.def, input.state, candidate.move, input.runtime));
    cache.set(candidate.stableMoveKey, outcome);
    return outcome;
  }

  function classifyPreviewOutcome(classification: PlayableCandidateClassification): PreviewOutcome {
    if (classification.kind !== 'playableComplete') {
      return {
        kind: 'unknown',
        reason: 'unresolved',
        ...(classification.kind === 'rejected' ? { failureReason: classification.rejection } : {}),
      };
    }

    return tryApplyPreview(classification.move);
  }

  function tryApplyPreview(trustedMove: TrustedExecutableMove): PreviewOutcome {
    if (trustedMove.sourceStateHash !== input.state.stateHash) {
      return {
        kind: 'unknown',
        reason: 'failed',
        failureReason: 'sourceStateHashMismatch',
      };
    }

    try {
      const previewState = deps.applyMove(
        input.def,
        input.state,
        trustedMove,
        { advanceToDecisionPoint: false },
        input.runtime,
      ).state;
      const eventRngDiverged = !rngStatesEqual(previewState.rng, input.state.rng);

      if (eventRngDiverged && input.previewMode === 'exactWorld') {
        return { kind: 'unknown', reason: 'random' };
      }

      const grantedOperationResult = tryApplyGrantedOperationPreview(trustedMove, previewState);
      const finalState = grantedOperationResult?.state ?? previewState;
      const rngDiverged = !rngStatesEqual(finalState.rng, input.state.rng);
      const observation = deps.derivePlayerObservation(input.def, finalState, input.playerId);
      return {
        kind: rngDiverged ? 'stochastic' : 'ready',
        state: finalState,
        hiddenSamplingZones: observation.hiddenSamplingZones,
        metricCache: new Map<string, number>(),
        victorySurface: null,
        ...(grantedOperationResult === undefined ? {} : { grantedOperation: grantedOperationResult.grantedOperation }),
      };
    } catch (error) {
      return {
        kind: 'unknown',
        reason: 'failed',
        failureReason: truncatePreviewFailureReason(error),
      };
    }
  }

  function tryApplyGrantedOperationPreview(
    trustedMove: TrustedExecutableMove,
    previewState: GameState,
  ): {
    readonly state: GameState;
    readonly grantedOperation: PolicyPreviewGrantedOperation;
  } | undefined {
    const eventCardId = trustedMove.move.params.eventCardId;
    const sideParam = trustedMove.move.params.side;
    if (typeof eventCardId !== 'string') {
      return undefined;
    }

    let eventSide: 'shaded' | 'unshaded';
    if (sideParam === 'shaded') {
      eventSide = 'shaded';
    } else if (sideParam === 'unshaded') {
      eventSide = 'unshaded';
    } else {
      return undefined;
    }

    const annotation = input.def.cardAnnotationIndex?.entries[eventCardId]?.[eventSide];
    if (annotation === undefined || !annotation.grantsOperation) {
      return undefined;
    }

    const isGrantee = annotation.grantOperationSeats.includes('self')
      || annotation.grantOperationSeats.includes(input.seatId);
    if (!isGrantee) {
      return undefined;
    }

    const selected = deps.evaluateGrantedOperation(input.def, previewState, input.seatId, input.runtime);
    if (selected === undefined) {
      return undefined;
    }

    const classification = deps.classifyPlayableMoveCandidate(input.def, previewState, selected.move, input.runtime);
    if (classification.kind !== 'playableComplete' && classification.kind !== 'playableStochastic') {
      return undefined;
    }

    try {
      const postEventPlusOpState = deps.applyMove(
        input.def,
        previewState,
        classification.move,
        { advanceToDecisionPoint: false },
        input.runtime,
      ).state;
      return {
        state: postEventPlusOpState,
        grantedOperation: {
          move: selected.move,
          score: selected.score,
          ...(getSeatMargin(input.def, previewState, input.seatId, input.runtime) === undefined
            ? {}
            : { preEventMargin: getSeatMargin(input.def, previewState, input.seatId, input.runtime)! }),
          ...(getSeatMargin(input.def, postEventPlusOpState, input.seatId, input.runtime) === undefined
            ? {}
            : { postEventPlusOpMargin: getSeatMargin(input.def, postEventPlusOpState, input.seatId, input.runtime)! }),
        },
      };
    } catch {
      return undefined;
    }
  }
}

function toPreviewTraceOutcome(outcome: PreviewOutcome): PolicyPreviewTraceOutcome {
  return outcome.kind === 'ready' ? 'ready' : outcome.kind === 'stochastic' ? 'stochastic' : outcome.reason;
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

export function getSeatMargin(
  def: GameDef,
  state: GameState,
  seatId: string,
  runtime?: GameDefRuntime,
): number | undefined {
  return buildPolicyVictorySurface(def, state, runtime).marginBySeat.get(seatId);
}

function rngStatesEqual(left: RngState, right: RngState): boolean {
  return left.algorithm === right.algorithm
    && left.version === right.version
    && left.state.length === right.state.length
    && left.state.every((entry, index) => entry === right.state[index]);
}

function truncatePreviewFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 160 ? message : `${message.slice(0, 157)}...`;
}
