import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import { derivePlayerObservation } from '../kernel/observation.js';
import { applyTrustedMove } from '../kernel/apply-move.js';
import { probeMoveViability } from '../kernel/apply-move.js';
import { applyPublishedDecisionFromCanonicalState } from '../kernel/microturn/apply.js';
import { publishMicroturn, publishMicroturnFromCanonicalState, publishMicroturnGreedyChooseOne } from '../kernel/microturn/publish.js';
import type { ChooseNStepContext, ChooseOneContext, Decision, MicroturnState } from '../kernel/microturn/types.js';
import { classifyMoveAdmissibility } from '../kernel/move-admissibility.js';
import { createSeatResolutionContext } from '../kernel/identity.js';
import { createTrustedExecutableMove } from '../kernel/trusted-move.js';
import { selectChoiceOptionsByLegalityPrecedence, selectUniqueChoiceOptionValuesByLegalityPrecedence } from '../kernel/choice-option-policy.js';
import type { PlayerId, ZoneId } from '../kernel/branded.js';
import type {
  AgentPolicyCatalog,
  AgentPreviewCompletionPolicy,
  AgentPreviewMode,
  ChoicePendingChooseNRequest,
  ChoicePendingChooseOneRequest,
  CompiledAgentProfile,
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
import { buildCompletionChooseCallback, selectBestCompletionChooseOneValue } from './completion-guidance-choice.js';

const K_PREVIEW_DEPTH = 8;

export interface PolicyPreviewCandidate {
  readonly move: Move;
  readonly stableMoveKey: string;
  readonly actionId?: string;
}

export interface PolicyPreviewDependencies {
  readonly classifyCandidate?: (
    def: GameDef,
    state: GameState,
    move: Move,
    runtime?: GameDefRuntime,
  ) => PreviewCandidateClassification;
  readonly classifyPlayableMoveCandidate?: (
    def: GameDef,
    state: GameState,
    move: Move,
    runtime?: GameDefRuntime,
  ) => PreviewCandidateClassification;
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
  readonly completionPolicy?: AgentPreviewCompletionPolicy;
  readonly completionDepthCap?: number;
  readonly agentGuidedDeps?: {
    readonly catalog: AgentPolicyCatalog;
    readonly profile: CompiledAgentProfile;
  };
}

export interface PolicyPreviewRuntime {
  dispose(): void;
  markGated(candidate: PolicyPreviewCandidate): void;
  resolveSurface(
    candidate: PolicyPreviewCandidate,
    ref: CompiledPreviewSurfaceRef,
    seatContext?: string,
  ): PolicyPreviewSurfaceResolution;
  getPreviewState(candidate: PolicyPreviewCandidate): GameState | undefined;
  getOutcome(candidate: PolicyPreviewCandidate): PolicyPreviewTraceOutcome;
  getFailureReason(candidate: PolicyPreviewCandidate): string | undefined;
  getCompletionMetadata(candidate: PolicyPreviewCandidate): PolicyPreviewCompletionMetadata | undefined;
  getGrantedOperation(candidate: PolicyPreviewCandidate): PolicyPreviewGrantedOperation | undefined;
  hasPreviewData(candidate: PolicyPreviewCandidate): boolean;
  hasMaterializedOutcome(candidate: PolicyPreviewCandidate): boolean;
}

export type PolicyPreviewUnavailabilityReason =
  | 'random'
  | 'hidden'
  | 'unresolved'
  | 'failed'
  | 'depthCap'
  | 'noPreviewDecision'
  | 'gated';
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

export interface PolicyPreviewCompletionMetadata {
  readonly depth: number;
  readonly policy: AgentPreviewCompletionPolicy;
}

type PreviewOutcome =
  | {
      readonly kind: 'ready';
      readonly state: GameState;
      readonly trustedMove: TrustedExecutableMove;
      readonly driveDepth: number;
      readonly completionPolicy: AgentPreviewCompletionPolicy;
      readonly hiddenSamplingZones: readonly ZoneId[];
      readonly metricCache: Map<string, number>;
      victorySurface: PolicyVictorySurface | null;
      grantedOperationResolved: boolean;
      grantedOperation: PolicyPreviewGrantedOperation | undefined;
    }
  | {
      readonly kind: 'stochastic';
      readonly state: GameState;
      readonly trustedMove: TrustedExecutableMove;
      readonly driveDepth: number;
      readonly completionPolicy: AgentPreviewCompletionPolicy;
      readonly hiddenSamplingZones: readonly ZoneId[];
      readonly metricCache: Map<string, number>;
      victorySurface: PolicyVictorySurface | null;
      grantedOperationResolved: boolean;
      grantedOperation: PolicyPreviewGrantedOperation | undefined;
    }
  | {
      readonly kind: 'unknown';
      readonly reason: PolicyPreviewUnavailabilityReason;
      readonly failureReason?: string;
      readonly driveDepth?: number;
      readonly completionPolicy?: AgentPreviewCompletionPolicy;
    };

type PreviewCandidateClassification =
  | {
      readonly kind: 'playable';
      readonly move: TrustedExecutableMove;
    }
  | {
      readonly kind: 'rejected';
      readonly failureReason?: string;
    };

type DriveResult =
  | {
      readonly kind: 'completed';
      readonly state: GameState;
      readonly depth: number;
    }
  | {
      readonly kind: 'stochastic';
      readonly state: GameState;
      readonly depth: number;
    }
  | {
      readonly kind: 'depthCap';
      readonly state: GameState;
      readonly depth: number;
    }
  | {
      readonly kind: 'failed';
      readonly reason: PolicyPreviewUnavailabilityReason;
      readonly depth?: number;
      readonly failureReason?: string;
    };

type ChooseOneMicroturn = MicroturnState & {
  readonly kind: 'chooseOne';
  readonly decisionContext: ChooseOneContext;
};

type ChooseNStepMicroturn = MicroturnState & {
  readonly kind: 'chooseNStep';
  readonly decisionContext: ChooseNStepContext;
};

const classifyPreviewCandidate = (
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
): PreviewCandidateClassification => {
  const viability = probeMoveViability(def, state, move, runtime);
  if (!viability.viable) {
    return {
      kind: 'rejected',
      failureReason: viability.code,
    };
  }
  const admissibility = classifyMoveAdmissibility(def, state, move, viability, runtime);
  if (admissibility.kind === 'inadmissible') {
    return {
      kind: 'rejected',
      failureReason: admissibility.reason,
    };
  }
  return {
    kind: 'playable',
    move: createTrustedExecutableMove(viability.move, state.stateHash, 'enumerateLegalMoves'),
  };
};

const defaultDependencies = {
  classifyCandidate: classifyPreviewCandidate,
  classifyPlayableMoveCandidate: classifyPreviewCandidate,
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

const createChooseOneRequest = (
  microturn: ChooseOneMicroturn,
): ChoicePendingChooseOneRequest => ({
  kind: 'pending',
  complete: false,
  decisionKey: microturn.decisionContext.decisionKey,
  name: String(microturn.decisionContext.decisionKey),
  options: microturn.decisionContext.options,
  targetKinds: [],
  type: 'chooseOne',
});

const createChooseNRequest = (
  microturn: ChooseNStepMicroturn,
): ChoicePendingChooseNRequest => ({
  kind: 'pending',
  complete: false,
  decisionKey: microturn.decisionContext.decisionKey,
  name: String(microturn.decisionContext.decisionKey),
  options: microturn.decisionContext.options,
  targetKinds: [],
  type: 'chooseN',
  min: microturn.decisionContext.cardinality.min,
  max: microturn.decisionContext.cardinality.max,
  selected: microturn.decisionContext.selectedSoFar,
  canConfirm: microturn.decisionContext.stepCommands.includes('confirm'),
});

const findMatchingChooseOneDecision = (
  microturn: ChooseOneMicroturn,
  value: unknown,
): Decision | undefined =>
  microturn.legalActions.find(
    (decision): decision is Extract<Decision, { readonly kind: 'chooseOne' }> =>
      decision.kind === 'chooseOne'
      && decision.decisionKey === microturn.decisionContext.decisionKey
      && JSON.stringify(decision.value) === JSON.stringify(value),
  );

const pickGreedyChooseOneDecision = (
  microturn: ChooseOneMicroturn,
): Decision | undefined => {
  const request = createChooseOneRequest(microturn);
  const selected = selectChoiceOptionsByLegalityPrecedence(request)[0]?.value;
  return selected === undefined ? undefined : findMatchingChooseOneDecision(microturn, selected);
};

const pickGreedyChooseNStepDecision = (
  microturn: ChooseNStepMicroturn,
): Decision | undefined => {
  const context = microturn.decisionContext;
  if (
    context.selectedSoFar.length >= context.cardinality.min
    && context.stepCommands.includes('confirm')
  ) {
    return microturn.legalActions.find(
      (decision): decision is Extract<Decision, { readonly kind: 'chooseNStep' }> =>
        decision.kind === 'chooseNStep'
        && decision.decisionKey === context.decisionKey
        && decision.command === 'confirm',
    );
  }

  const request = createChooseNRequest(microturn);
  const selected = new Set<unknown>(context.selectedSoFar);
  const nextValue = selectUniqueChoiceOptionValuesByLegalityPrecedence(request)
    .find((value) => !selected.has(value));
  if (nextValue === undefined) {
    return undefined;
  }
  return microturn.legalActions.find(
    (decision): decision is Extract<Decision, { readonly kind: 'chooseNStep' }> =>
      decision.kind === 'chooseNStep'
      && decision.decisionKey === context.decisionKey
      && decision.command === 'add'
      && decision.value === nextValue,
  );
};

const pickAgentGuidedChooseOneDecision = (
  state: GameState,
  def: GameDef,
  microturn: ChooseOneMicroturn,
  input: CreatePolicyPreviewRuntimeInput,
): Decision | undefined => {
  const guided = input.agentGuidedDeps;
  if (guided === undefined) {
    return undefined;
  }
  const request = createChooseOneRequest(microturn);
  const selected = selectBestCompletionChooseOneValue({
    state,
    def,
    catalog: guided.catalog,
    playerId: input.playerId,
    seatId: input.seatId,
    profile: guided.profile,
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
  }, request, { requirePositiveScore: false })?.value;
  return selected === undefined ? undefined : findMatchingChooseOneDecision(microturn, selected);
};

const pickAgentGuidedChooseNStepDecision = (
  state: GameState,
  def: GameDef,
  microturn: ChooseNStepMicroturn,
  input: CreatePolicyPreviewRuntimeInput,
): Decision | undefined => {
  const guided = input.agentGuidedDeps;
  if (guided === undefined) {
    return undefined;
  }
  const choose = buildCompletionChooseCallback({
    state,
    def,
    catalog: guided.catalog,
    playerId: input.playerId,
    seatId: input.seatId,
    profile: guided.profile,
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
  });
  if (choose === undefined) {
    return undefined;
  }

  const preferredSelection = choose(createChooseNRequest(microturn));
  if (preferredSelection === undefined) {
    return undefined;
  }
  const preferredValues = Array.isArray(preferredSelection)
    ? preferredSelection
    : [preferredSelection];
  const selected = microturn.decisionContext.selectedSoFar;
  const nextAdd = preferredValues.find((value) => !selected.some((entry) => entry === value));
  if (nextAdd !== undefined) {
    return microturn.legalActions.find(
      (decision): decision is Extract<Decision, { readonly kind: 'chooseNStep' }> =>
        decision.kind === 'chooseNStep'
        && decision.decisionKey === microturn.decisionContext.decisionKey
        && decision.command === 'add'
        && decision.value === nextAdd,
    );
  }
  if (
    preferredValues.length === selected.length
    && preferredValues.every((value) => selected.some((entry) => entry === value))
  ) {
    return microturn.legalActions.find(
      (decision): decision is Extract<Decision, { readonly kind: 'chooseNStep' }> =>
        decision.kind === 'chooseNStep'
        && decision.decisionKey === microturn.decisionContext.decisionKey
        && decision.command === 'confirm',
    );
  }
  return undefined;
};

const pickInnerDecision = (
  state: GameState,
  def: GameDef,
  microturn: ReturnType<typeof publishMicroturn>,
  policy: AgentPreviewCompletionPolicy,
  input: CreatePolicyPreviewRuntimeInput,
): Decision | undefined => {
  if (microturn.kind === 'chooseOne') {
    const chooseOne = microturn as ChooseOneMicroturn;
    return policy === 'agentGuided'
      ? pickAgentGuidedChooseOneDecision(state, def, chooseOne, input) ?? pickGreedyChooseOneDecision(chooseOne)
      : pickGreedyChooseOneDecision(chooseOne);
  }
  if (microturn.kind === 'chooseNStep') {
    const chooseN = microturn as ChooseNStepMicroturn;
    return policy === 'agentGuided'
      ? pickAgentGuidedChooseNStepDecision(state, def, chooseN, input) ?? pickGreedyChooseNStepDecision(chooseN)
      : pickGreedyChooseNStepDecision(chooseN);
  }
  return undefined;
};

export function createPolicyPreviewRuntime(input: CreatePolicyPreviewRuntimeInput): PolicyPreviewRuntime {
  const deps = {
    ...defaultDependencies,
    ...input.dependencies,
  } satisfies Required<PolicyPreviewDependencies>;
  /**
   * Owner scope: one policy preview runtime, itself owned by a single
   * policy-evaluation/publication pass.
   * Key shape: `candidate.stableMoveKey`.
   * Maximum retained population: bounded by the candidates previewed
   * during this evaluation scope.
   * Drop rule: cleared in `dispose()` before the owning runtime
   * providers are discarded.
   */
  const cache = new Map<string, PreviewOutcome>();
  let disposed = false;
  const seatResolutionIndex = createSeatResolutionContext(input.def, input.state.playerCount).index;
  const completionPolicy = input.completionPolicy ?? 'greedy';
  const completionDepthCap = input.completionDepthCap ?? K_PREVIEW_DEPTH;
  // origin is computed against `input.state`, which is invariant across all
  // candidates in this runtime. Cache lazily so each driveSyntheticCompletion
  // pays the publishMicroturn cost once instead of once per candidate.
  let cachedOrigin: ReturnType<typeof publishMicroturn> | undefined;
  // Different candidates' preview drives sometimes converge to the same final
  // state (especially in FITL where a handful of capability cards collapse to
  // the same post-effect state). derivePlayerObservation iterates every
  // def.zones entry and allocates per-zone arrays/maps — caching by stateHash
  // pays for itself when even a few outcomes share a hash.
  const hiddenZonesByStateHash = new Map<bigint, readonly ZoneId[]>();
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
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const outcome of cache.values()) {
        if (outcome.kind === 'ready' || outcome.kind === 'stochastic') {
          outcome.metricCache.clear();
          outcome.victorySurface = null;
        }
      }
      cache.clear();
    },
    markGated(candidate) {
      if (disposed) {
        return;
      }
      cache.set(candidate.stableMoveKey, { kind: 'unknown', reason: 'gated', failureReason: 'gated' });
    },
    resolveSurface(candidate, ref, seatContext) {
      if (disposed) {
        return { kind: 'unknown', reason: 'failed', failureReason: 'previewRuntimeDisposed' };
      }
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
      if (disposed) {
        return undefined;
      }
      const outcome = getPreviewOutcome(candidate);
      return outcome.kind === 'ready' || outcome.kind === 'stochastic'
        ? outcome.state
        : undefined;
    },
    getOutcome(candidate) {
      if (disposed) {
        return 'failed';
      }
      return toPreviewTraceOutcome(getPreviewOutcome(candidate));
    },
    getFailureReason(candidate) {
      if (disposed) {
        return 'previewRuntimeDisposed';
      }
      const outcome = getPreviewOutcome(candidate);
      return outcome.kind === 'unknown' ? outcome.failureReason : undefined;
    },
    getCompletionMetadata(candidate) {
      if (disposed) {
        return undefined;
      }
      const outcome = getPreviewOutcome(candidate);
      return outcome.driveDepth === undefined || outcome.completionPolicy === undefined
        ? undefined
        : { depth: outcome.driveDepth, policy: outcome.completionPolicy };
    },
    getGrantedOperation(candidate) {
      if (disposed) {
        return undefined;
      }
      const outcome = getPreviewOutcome(candidate);
      return outcome.kind === 'ready' || outcome.kind === 'stochastic'
        ? getGrantedOperation(outcome)
        : undefined;
    },
    hasPreviewData(candidate) {
      if (disposed) {
        return false;
      }
      const candidateActionId = candidate.actionId ?? String(candidate.move.actionId);
      return input.trustedMoveIndex.has(candidate.stableMoveKey)
        || input.phase1ActionPreviewIndex?.has(candidateActionId) === true;
    },
    hasMaterializedOutcome(candidate) {
      if (disposed) {
        return false;
      }
      const cached = cache.get(candidate.stableMoveKey);
      return cached !== undefined
        && !(cached.kind === 'unknown' && (cached.reason === 'gated' || cached.reason === 'failed'));
    },
  };

  function getPreviewOutcome(candidate: PolicyPreviewCandidate): PreviewOutcome {
    if (disposed) {
      return { kind: 'unknown', reason: 'failed', failureReason: 'previewRuntimeDisposed' };
    }
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
      ? finalizePreview(trustedMove, driveSyntheticCompletion(trustedMove))
      : representativeTrustedMove !== undefined
        ? finalizePreview(representativeTrustedMove, driveSyntheticCompletion(representativeTrustedMove))
        : classifyPreviewOutcome(
          (deps.classifyPlayableMoveCandidate ?? deps.classifyCandidate)(
            input.def,
            input.state,
            candidate.move,
            input.runtime,
          ),
        );
    cache.set(candidate.stableMoveKey, outcome);
    return outcome;
  }

  function classifyPreviewOutcome(classification: PreviewCandidateClassification): PreviewOutcome {
    if (classification.kind !== 'playable') {
      return {
        kind: 'unknown',
        reason: 'unresolved',
        ...(classification.failureReason === undefined ? {} : { failureReason: classification.failureReason }),
      };
    }

    return finalizePreview(classification.move, driveSyntheticCompletion(classification.move));
  }

  function driveSyntheticCompletion(trustedMove: TrustedExecutableMove): DriveResult {
    if (trustedMove.sourceStateHash !== input.state.stateHash) {
      return {
        kind: 'failed',
        reason: 'failed',
        failureReason: 'sourceStateHashMismatch',
      };
    }

    try {
      // input.state is the action-selection state delivered to the agent by the
      // simulator — always canonically hashed. Subsequent loop-iteration states
      // come from applyPublishedDecision().state, which the kernel emits with
      // hash already computed (via updateHash). Use the canonical-state fast
      // variants to skip the redundant entry hash recomputation each iteration.
      const origin = cachedOrigin === undefined
        ? (cachedOrigin = publishMicroturnFromCanonicalState(input.def, input.state, input.runtime))
        : cachedOrigin;
      let state: GameState;
      try {
        state = deps.applyMove(
          input.def,
          input.state,
          trustedMove,
          { advanceToDecisionPoint: true },
          input.runtime,
        ).state;
      } catch {
        const actionDecision: Decision = {
          kind: 'actionSelection',
          actionId: trustedMove.move.actionId,
          move: trustedMove.move,
        };
        state = applyPublishedDecisionFromCanonicalState(input.def, input.state, origin, actionDecision, { advanceToDecisionPoint: true }, input.runtime).state;
      }
      let depth = 1;

      while (true) {
        // Cheap exit-condition check: derive kind/seatId/turnId from
        // state.decisionStack top without enumerating legalActions or
        // computing the projected-state observation. Matches publishMicroturn's
        // logic exactly: empty stack → actionSelection; otherwise top frame's
        // context kind/seatId/turnId.
        const top = state.decisionStack?.at(-1);
        if (top === undefined) {
          return { kind: 'completed', state, depth };
        }
        const ctxKind = top.context.kind;
        const topSeatId = top.context.seatId;
        if (
          ctxKind === 'actionSelection'
          || ctxKind === 'outcomeGrantResolve'
          || ctxKind === 'turnRetirement'
          || topSeatId !== origin.seatId
          || top.turnId !== origin.turnId
        ) {
          return { kind: 'completed', state, depth };
        }
        if (ctxKind === 'stochasticResolve') {
          return { kind: 'stochastic', state, depth };
        }
        if (depth >= completionDepthCap) {
          return { kind: 'depthCap', state, depth };
        }

        // Fast path for greedy chooseOne: skip remaining-option verification +
        // projected-state observation by using the kernel's greedy-aware
        // publish variant. Falls through to the slow path for chooseNStep
        // (which has more complex selection rules).
        if (ctxKind === 'chooseOne' && completionPolicy === 'greedy') {
          const greedy = publishMicroturnGreedyChooseOne(input.def, state, input.runtime);
          if (greedy === null) {
            return { kind: 'failed', reason: 'noPreviewDecision', depth, failureReason: 'noPreviewDecision' };
          }
          state = applyPublishedDecisionFromCanonicalState(input.def, state, greedy.microturn, greedy.decision, { advanceToDecisionPoint: true }, input.runtime).state;
          depth += 1;
          continue;
        }

        const microturn = publishMicroturnFromCanonicalState(input.def, state, input.runtime);
        const decision = pickInnerDecision(state, input.def, microturn, completionPolicy, input);
        if (decision === undefined) {
          return { kind: 'failed', reason: 'noPreviewDecision', depth, failureReason: 'noPreviewDecision' };
        }
        state = applyPublishedDecisionFromCanonicalState(input.def, state, microturn, decision, { advanceToDecisionPoint: true }, input.runtime).state;
        depth += 1;
      }
    } catch (error) {
      return {
        kind: 'failed',
        reason: 'failed',
        failureReason: truncatePreviewFailureReason(error),
      };
    }
  }

  function finalizePreview(trustedMove: TrustedExecutableMove, result: DriveResult): PreviewOutcome {
    if (result.kind === 'failed') {
      return {
        kind: 'unknown',
        reason: result.reason,
        ...(result.depth === undefined ? {} : { driveDepth: result.depth, completionPolicy }),
        ...(result.failureReason === undefined ? {} : { failureReason: result.failureReason }),
      };
    }
    if (result.kind === 'depthCap') {
      return {
        kind: 'unknown',
        reason: 'depthCap',
        failureReason: 'depthCap',
        driveDepth: result.depth,
        completionPolicy,
      };
    }

    if (result.kind === 'stochastic' && input.previewMode === 'exactWorld') {
      return { kind: 'unknown', reason: 'random', driveDepth: result.depth, completionPolicy };
    }

    const rngDiverged = !rngStatesEqual(result.state.rng, input.state.rng);
    if (rngDiverged && input.previewMode === 'exactWorld') {
      return { kind: 'unknown', reason: 'random', driveDepth: result.depth, completionPolicy };
    }

    const stateHashKey = result.state.stateHash;
    let hiddenSamplingZones = hiddenZonesByStateHash.get(stateHashKey);
    if (hiddenSamplingZones === undefined) {
      hiddenSamplingZones = deps.derivePlayerObservation(input.def, result.state, input.playerId).hiddenSamplingZones;
      hiddenZonesByStateHash.set(stateHashKey, hiddenSamplingZones);
    }
    return {
      kind: result.kind === 'stochastic' || rngDiverged ? 'stochastic' : 'ready',
      state: result.state,
      trustedMove,
      driveDepth: result.depth,
      completionPolicy,
      hiddenSamplingZones,
      metricCache: new Map<string, number>(),
      victorySurface: null,
      grantedOperationResolved: false,
      grantedOperation: undefined,
    };
  }

  function getGrantedOperation(
    preview: Extract<PreviewOutcome, { readonly kind: 'ready' } | { readonly kind: 'stochastic' }>,
  ): PolicyPreviewGrantedOperation | undefined {
    if (!preview.grantedOperationResolved) {
      preview.grantedOperationResolved = true;
      preview.grantedOperation = tryApplyGrantedOperationPreview(preview.trustedMove, preview.state)?.grantedOperation;
    }
    return preview.grantedOperation;
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

    const classification = (deps.classifyPlayableMoveCandidate ?? deps.classifyCandidate)(
      input.def,
      previewState,
      selected.move,
      input.runtime,
    );
    if (classification.kind !== 'playable') {
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
      const preEventMargin = getSeatMargin(input.def, previewState, input.seatId, input.runtime);
      const postEventPlusOpMargin = getSeatMargin(input.def, postEventPlusOpState, input.seatId, input.runtime);
      return {
        state: postEventPlusOpState,
        grantedOperation: {
          move: selected.move,
          score: selected.score,
          ...(preEventMargin === undefined ? {} : { preEventMargin }),
          ...(postEventPlusOpMargin === undefined ? {} : { postEventPlusOpMargin }),
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
