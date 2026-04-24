import { findActionById } from './action-capabilities.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { toExecutionPipeline } from './apply-move-pipeline.js';
import { asActionId, asPlayerId } from './branded.js';
import {
  estimateMoveParamValueComplexity,
  selectChoiceOptionValuesByLegalityPrecedence,
  selectUniqueChoiceOptionValuesByLegalityPrecedence,
} from './choice-option-policy.js';
import { evaluateConditionWithCache } from './compiled-condition-expr-cache.js';
import { isDeclaredActionParamValueInDomain } from './declared-action-param-domain.js';
import { createEvalRuntimeResources, type ReadContext } from './eval-context.js';
import { createExecutionEffectContext } from './effect-context.js';
import { applyEffects } from './effects.js';
import { isEffectRuntimeReason } from './effect-error.js';
import {
  collectGrantAwareMoveZoneCandidates,
  resolveGrantMoveActionClassOverride,
} from './free-operation-grant-bindings.js';
import {
  classifyDecisionContinuationSatisfiability,
  resolveDecisionContinuation,
  type DecisionContinuationResult,
} from './microturn/continuation.js';
import { resolveMoveEnumerationBudgets } from './move-enumeration-budgets.js';
import {
  decideApplyMovePipelineViability,
  evaluatePipelinePredicateStatus,
  evaluateStagePredicateStatus,
} from './pipeline-viability-policy.js';
import { resolvePlayerIndexForTurnFlowSeat, type SeatResolutionContext } from './identity.js';
import { resolveFreeOperationGrantSeatToken } from './free-operation-seat-resolution.js';
import {
  resolveFreeOperationDiscoveryAnalysis,
  isFreeOperationApplicableForMove,
  isFreeOperationPotentiallyGrantedForMove,
  isFreeOperationGrantedForMove,
} from './free-operation-discovery-analysis.js';
import { resolveGrantFreeOperationActionDomain } from './free-operation-action-domain.js';
import { resolveFreeOperationExecutionContext } from './free-operation-execution-context.js';
import { doesMaterialGameplayStateChange, resolveStrongestRequiredFreeOperationOutcomeGrant } from './free-operation-outcome-policy.js';
import { buildFreeOperationPreflightOverlay } from './free-operation-preflight-overlay.js';
import {
  resolvePendingFreeOperationGrantSequenceStatus,
  resolveSequenceProgressionPolicy,
} from './free-operation-sequence-progression.js';
import { createProbeOverlay, stripZoneFilterFromProbeGrant } from './grant-lifecycle.js';
import { buildPendingFreeOperationGrant } from './pending-free-operation-grant-builder.js';
import {
  buildMoveRuntimeBindings,
  deriveDecisionBindingsFromMoveParams,
  resolvePipelineDecisionBindingsForMove,
} from './move-runtime-bindings.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { buildAdjacencyGraph } from './spatial.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import { cardDrivenRuntime, type CardDrivenRuntime } from './card-driven-accessors.js';
import { isMoveAllowedByRequiredPendingFreeOperationGrant } from './required-free-operation-admissibility.js';
import type {
  ActionPipelineDef,
  ChoicePendingRequest,
  GameDef,
  GameState,
  Move,
  MoveParamScalar,
  MoveParamValue,
  RuntimeWarning,
  TurnFlowFreeOperationGrantContract,
  TurnFlowFreeOperationGrantViabilityPolicy,
  TurnFlowPendingFreeOperationGrant,
} from './types.js';

const resolveProbeGrantSeats = (
  grant: TurnFlowFreeOperationGrantContract,
  activeSeat: string,
  seatOrder: readonly string[],
): { readonly seat: string; readonly executeAsSeat?: string } | null => {
  const seat = resolveFreeOperationGrantSeatToken(grant.seat, activeSeat, seatOrder);
  if (seat === null) {
    return null;
  }

  if (grant.executeAsSeat === undefined) {
    return { seat };
  }

  const executeAsSeat = resolveFreeOperationGrantSeatToken(grant.executeAsSeat, activeSeat, seatOrder);
  if (executeAsSeat === null) {
    return null;
  }
  return { seat, executeAsSeat };
};

const toResolvedProbePendingGrant = (
  grant: TurnFlowFreeOperationGrantContract,
  activeSeat: string,
  seatOrder: readonly string[],
  grantId: string,
  evalContext?: ReadContext,
): TurnFlowPendingFreeOperationGrant | null => {
  const resolvedSeats = resolveProbeGrantSeats(grant, activeSeat, seatOrder);
  if (resolvedSeats === null) {
    return null;
  }
  const executionContext = evalContext === undefined
    ? undefined
    : resolveFreeOperationExecutionContext(grant.executionContext, evalContext);
  return buildPendingFreeOperationGrant(grant, {
    grantId,
    seat: resolvedSeats.seat,
    ...(resolvedSeats.executeAsSeat === undefined ? {} : { executeAsSeat: resolvedSeats.executeAsSeat }),
    ...(grant.sequence === undefined ? {} : { sequenceBatchId: '__probeBatch__' }),
    ...(executionContext === undefined ? {} : { executionContext }),
  });
};

const resolveProbeGrantPhase = (
  runtime: CardDrivenRuntime,
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  grant: TurnFlowPendingFreeOperationGrant,
): TurnFlowPendingFreeOperationGrant['phase'] => {
  if (grant.phase !== 'sequenceWaiting') {
    return grant.phase;
  }
  return resolvePendingFreeOperationGrantSequenceStatus(
    pending,
    grant,
    runtime.freeOperationSequenceContexts,
  ).ready
    ? 'ready'
    : grant.phase;
};

const resolveUnusableSequenceProbeBlockers = (
  def: GameDef,
  state: GameState,
  grant: TurnFlowFreeOperationGrantContract,
  activeSeat: string,
  seatOrder: readonly string[],
  seatResolution: SeatResolutionContext,
  baseBlockers: readonly TurnFlowPendingFreeOperationGrant[],
  candidates: readonly TurnFlowFreeOperationGrantContract[],
  evalContext?: ReadContext,
): readonly TurnFlowPendingFreeOperationGrant[] => {
  const sequence = grant.sequence;
  if (sequence === undefined) {
    return baseBlockers;
  }
  if (resolveSequenceProgressionPolicy(grant) === 'implementWhatCanInOrder') {
    return baseBlockers;
  }

  const derivedBlockers = [...baseBlockers];
  const priorCandidates = candidates
    .filter(
      (candidate) =>
        candidate.sequence !== undefined &&
        candidate.sequence.batch === sequence.batch &&
        candidate.sequence.step < sequence.step,
    )
    .sort((left, right) => left.sequence!.step - right.sequence!.step);

  for (const [index, candidate] of priorCandidates.entries()) {
    const candidateUsable = isFreeOperationGrantUsableInCurrentState(
      def,
      state,
      candidate,
      activeSeat,
      seatOrder,
      seatResolution,
      {
        sequenceProbeBlockers: derivedBlockers,
        ...(evalContext === undefined ? {} : { evalContext }),
      },
    );
    if (candidateUsable) {
      continue;
    }
    const blocker = toResolvedProbePendingGrant(
      candidate,
      activeSeat,
      seatOrder,
      `__probe_blocker__:${sequence.batch}:${candidate.sequence!.step}:${index}`,
      evalContext,
    );
    if (blocker !== null) {
      derivedBlockers.push(blocker);
    }
  }

  return derivedBlockers;
};

export const DEFAULT_FREE_OPERATION_GRANT_VIABILITY_POLICY: TurnFlowFreeOperationGrantViabilityPolicy = 'emitAlways';

export const resolveFreeOperationGrantViabilityPolicy = (
  grant: Pick<TurnFlowFreeOperationGrantContract, 'viabilityPolicy'>,
): TurnFlowFreeOperationGrantViabilityPolicy =>
  grant.viabilityPolicy ?? DEFAULT_FREE_OPERATION_GRANT_VIABILITY_POLICY;

export const grantRequiresUsableProbe = (grant: Pick<TurnFlowFreeOperationGrantContract, 'viabilityPolicy'>): boolean => {
  const policy = resolveFreeOperationGrantViabilityPolicy(grant);
  return policy === 'requireUsableAtIssue' || policy === 'requireUsableForEventPlay';
};

type FreeOperationDecisionSequenceResolver = (
  move: Move,
  options?: {
    readonly budgets?: Partial<ReturnType<typeof resolveMoveEnumerationBudgets>>;
    readonly onWarning?: (warning: RuntimeWarning) => void;
  },
) => DecisionContinuationResult;

const STRICT_FREE_OPERATION_PROBE_BUDGETS = {
  maxParamExpansions: 500_000,
  maxDecisionProbeSteps: 4_096,
} as const;

const visitSelectableDecisionValues = (
  def: GameDef,
  state: GameState,
  probeGrant: TurnFlowPendingFreeOperationGrant | null,
  currentMove: Move,
  request: ChoicePendingRequest,
  visit: (value: MoveParamValue) => boolean,
  options?: {
    readonly consumeParamExpansionBudget?: () => boolean;
  },
): boolean => {
  const probeValue = (value: MoveParamValue): number => {
    if (probeGrant === null) {
      return estimateMoveParamValueComplexity(state, value);
    }
    const fauxMove: Move = {
      actionId: currentMove.actionId,
      params: {
        ...currentMove.params,
        [request.decisionKey]: value,
      },
      freeOperation: true,
    };
    const probeZones = collectGrantAwareMoveZoneCandidates(def, state, fauxMove, probeGrant, {
      useProbeBindings: true,
    });
    if (probeZones.length > 0) {
      return probeZones.reduce((score, zoneId) => score + (state.zones[zoneId]?.length ?? 0), 0);
    }
    return estimateMoveParamValueComplexity(state, value);
  };
  if (request.type === 'chooseOne') {
    for (const selection of [...selectChoiceOptionValuesByLegalityPrecedence(request)]
      .sort((left, right) => probeValue(left) - probeValue(right))) {
      if (options?.consumeParamExpansionBudget !== undefined && !options.consumeParamExpansionBudget()) {
        return false;
      }
      if (visit(selection)) {
        return true;
      }
    }
    return false;
  }

  const selectableValues = [...selectUniqueChoiceOptionValuesByLegalityPrecedence(request)]
    .sort((left, right) => probeValue(left) - probeValue(right));
  if (request.type !== 'chooseN') {
    throw new Error('chooseN viability enumeration requires a chooseN request');
  }
  const min = request.min ?? 0;
  const max = Math.min(request.max ?? selectableValues.length, selectableValues.length);
  const sizeOrder = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const current: MoveParamScalar[] = [];

  const enumerate = (start: number, remaining: number): boolean => {
    if (remaining === 0) {
      return visit([...current]);
    }
    const upper = selectableValues.length - remaining;
    for (let index = start; index <= upper; index += 1) {
      if (options?.consumeParamExpansionBudget !== undefined && !options.consumeParamExpansionBudget()) {
        return false;
      }
      current.push(selectableValues[index] as MoveParamScalar);
      if (enumerate(index + 1, remaining - 1)) {
        current.pop();
        return true;
      }
      current.pop();
    }
    return false;
  };

  for (const size of sizeOrder) {
    if (size === 0) {
      if (options?.consumeParamExpansionBudget !== undefined && !options.consumeParamExpansionBudget()) {
        return false;
      }
      if (visit([])) {
        return true;
      }
      continue;
    }
    if (enumerate(0, size)) {
      return true;
    }
  }

  return false;
};

const decisionBindingsForMove = (
  pipeline: ActionPipelineDef | undefined,
  moveParams: Move['params'],
): Readonly<Record<string, MoveParamValue>> => {
  return pipeline === undefined
    ? deriveDecisionBindingsFromMoveParams(moveParams)
    : resolvePipelineDecisionBindingsForMove(pipeline, moveParams);
};

const hasTransportLikeStateChangeFallback = (
  def: GameDef,
  state: GameState,
  move: Move,
): boolean => {
  const zoneIds = new Set(def.zones.map((zone) => String(zone.id)));
  const tokenZoneById = new Map<string, string>(
    Object.entries(state.zones).flatMap(([zoneId, tokens]) => tokens.map((token) => [String(token.id), zoneId] as const)),
  );
  let sawExplicitDestinationBinding = false;

  for (const [paramName, value] of Object.entries(move.params)) {
    if (typeof value !== 'string' || !zoneIds.has(value)) {
      continue;
    }
    const delimiter = paramName.lastIndexOf('@');
    if (delimiter < 0 || delimiter === paramName.length - 1) {
      continue;
    }
    sawExplicitDestinationBinding = true;
    const tokenId = paramName.slice(delimiter + 1);
    const currentZone = tokenZoneById.get(tokenId);
    if (currentZone !== undefined && currentZone !== value) {
      return true;
    }
  }
  if (sawExplicitDestinationBinding) {
    return false;
  }

  const tokenIds = new Set(tokenZoneById.keys());
  const selectedZones = new Set<string>();
  let selectedTokens = 0;

  const visitValue = (value: MoveParamValue | undefined): void => {
    if (value === undefined) {
      return;
    }
    if (typeof value === 'string') {
      if (zoneIds.has(value)) {
        selectedZones.add(value);
      }
      if (tokenIds.has(value)) {
        selectedTokens += 1;
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry !== 'string') {
          continue;
        }
        if (zoneIds.has(entry)) {
          selectedZones.add(entry);
        }
        if (tokenIds.has(entry)) {
          selectedTokens += 1;
        }
      }
    }
  };

  for (const value of Object.values(move.params)) {
    visitValue(value);
  }

  return selectedTokens > 0 && selectedZones.size > 1;
};

const isCompletedProbeMoveCurrentlyLegal = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
): boolean => {
  const action = findActionById(def, move.actionId);
  if (action === undefined) {
    return false;
  }

  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
  const evalRuntimeResources = createEvalRuntimeResources();
  const freeOperationAnalysis = move.freeOperation === true
    ? resolveFreeOperationDiscoveryAnalysis(def, state, move, seatResolution, { zoneFilterErrorSurface: 'turnFlowEligibility' })
    : null;
  if (move.freeOperation === true && freeOperationAnalysis?.denial.cause !== 'granted') {
    return false;
  }

  const preflight = resolveActionApplicabilityPreflight({
    def,
    state,
    action,
    adjacencyGraph,
    decisionPlayer: state.activePlayer,
    bindings: buildMoveRuntimeBindings(move),
    runtimeTableIndex,
    evalRuntimeResources,
    ...buildFreeOperationPreflightOverlay(freeOperationAnalysis, move, 'turnFlowEligibility'),
  });
  if (preflight.kind !== 'applicable') {
    return false;
  }

  if (action.pre !== null && !evaluateConditionWithCache(action.pre, preflight.evalCtx)) {
    return false;
  }

  if (preflight.pipelineDispatch.kind === 'matched') {
    const status = evaluatePipelinePredicateStatus(action, preflight.pipelineDispatch.profile, preflight.evalCtx);
    return decideApplyMovePipelineViability(status, { isFreeOperation: move.freeOperation === true }).kind !== 'illegalMove';
  }

  for (const param of action.params) {
    if (!isDeclaredActionParamValueInDomain(param, move.params[param.name], preflight.evalCtx)) {
      return false;
    }
  }
  return true;
};

export const doesCompletedProbeMoveChangeGameplayState = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
): boolean => {
  const action = findActionById(def, move.actionId);
  if (action === undefined) {
    return false;
  }

  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
  const resources = createEvalRuntimeResources();
  const freeOperationAnalysis = move.freeOperation === true
    ? resolveFreeOperationDiscoveryAnalysis(def, state, move, seatResolution, { zoneFilterErrorSurface: 'turnFlowEligibility' })
    : null;
  if (move.freeOperation === true && freeOperationAnalysis?.denial.cause !== 'granted') {
    return false;
  }
  const preflight = resolveActionApplicabilityPreflight({
    def,
    state,
    action,
    adjacencyGraph,
    decisionPlayer: state.activePlayer,
    bindings: buildMoveRuntimeBindings(move),
    runtimeTableIndex,
    evalRuntimeResources: resources,
    ...buildFreeOperationPreflightOverlay(freeOperationAnalysis, move, 'turnFlowEligibility'),
  });
  if (preflight.kind !== 'applicable') {
    return false;
  }

  const executionProfile = preflight.pipelineDispatch.kind === 'matched'
    ? toExecutionPipeline(action, preflight.pipelineDispatch.profile)
    : undefined;
  const resolvedDecisionBindings = decisionBindingsForMove(
    preflight.pipelineDispatch.kind === 'matched' ? preflight.pipelineDispatch.profile : undefined,
    move.params,
  );
  const runtimeMoveParams = {
    ...move.params,
    ...resolvedDecisionBindings,
  };
  const freeOperationOverlay = buildFreeOperationPreflightOverlay(
    freeOperationAnalysis,
    move,
    'turnFlowEligibility',
  );
  const effectCtxBase = {
    def,
    adjacencyGraph,
    runtimeTableIndex,
    activePlayer: preflight.executionPlayer,
    actorPlayer: preflight.executionPlayer,
    bindings: buildMoveRuntimeBindings(move, resolvedDecisionBindings),
    moveParams: runtimeMoveParams,
    resources,
    state,
    rng: { state: state.rng },
    ...(freeOperationOverlay.freeOperationOverlay === undefined
      ? {}
      : { freeOperationOverlay: freeOperationOverlay.freeOperationOverlay }),
  } as const;

  let afterActionState: GameState;
  try {
    afterActionState = executionProfile === undefined
      ? applyEffects(action.effects, createExecutionEffectContext({
        ...effectCtxBase,
        traceContext: {
          eventContext: 'actionEffect',
          actionId: String(action.id),
          effectPathRoot: `action:${String(action.id)}.effects`,
        },
        effectPath: '',
      })).state
      : (() => {
        let currentState = state;
        let currentBindings: Readonly<Record<string, unknown>> = effectCtxBase.bindings;
        for (const [stageIdx, stage] of executionProfile.resolutionStages.entries()) {
          const stageEvalCtx = {
            ...preflight.evalCtx,
            state: currentState,
            bindings: currentBindings,
          };
          const status = evaluateStagePredicateStatus(
            action,
            executionProfile.profileId,
            stage,
            executionProfile.partialMode,
            stageEvalCtx,
            { includeCostValidation: move.freeOperation !== true },
          );
          const viability = decideApplyMovePipelineViability(status, { isFreeOperation: move.freeOperation === true });
          if (viability.kind === 'illegalMove' || !viability.costValidationPassed) {
            continue;
          }
          const result = applyEffects(stage.effects, createExecutionEffectContext({
            ...effectCtxBase,
            bindings: currentBindings,
            state: currentState,
            rng: { state: currentState.rng },
            traceContext: {
              eventContext: 'actionEffect',
              actionId: String(action.id),
              effectPathRoot: `action:${String(action.id)}.stages[${stageIdx}]`,
            },
            effectPath: '',
          }));
          currentState = result.state;
          currentBindings = result.bindings ?? currentBindings;
        }
        return currentState;
      })();
  } catch (error) {
    if (isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)) {
      return hasTransportLikeStateChangeFallback(def, state, move);
    }
    throw error;
  }

  return doesMaterialGameplayStateChange(def, state, afterActionState);
};

const hasLegalCompletedProbeMove = (
  def: GameDef,
  explorationState: GameState,
  authorizationState: GameState,
  baseMove: Move,
  seatResolution: SeatResolutionContext,
  options?: {
    readonly budgets?: Partial<ReturnType<typeof resolveMoveEnumerationBudgets>>;
    readonly onWarning?: (warning: RuntimeWarning) => void;
    readonly selectionGrant?: TurnFlowPendingFreeOperationGrant | null;
    readonly resolveDecisionSequence?: FreeOperationDecisionSequenceResolver;
  },
): boolean => {
  const budgets = resolveMoveEnumerationBudgets({
    ...STRICT_FREE_OPERATION_PROBE_BUDGETS,
    ...(options?.budgets ?? {}),
  });
  let decisionProbeSteps = 0;
  let paramExpansions = 0;
  const consumeParamExpansionBudget = (): boolean => {
    paramExpansions += 1;
    return paramExpansions <= budgets.maxParamExpansions;
  };
  const resolveDecisionSequence = options?.resolveDecisionSequence ?? ((move, resolveOptions) =>
    resolveDecisionContinuation(
      def,
      explorationState,
      move,
      {
        choose: () => undefined,
        ...(resolveOptions?.budgets === undefined ? {} : { budgets: resolveOptions.budgets }),
        ...(resolveOptions?.onWarning === undefined ? {} : { onWarning: resolveOptions.onWarning }),
      },
    ));

  const visit = (move: Move): boolean => {
    if (decisionProbeSteps >= budgets.maxDecisionProbeSteps || paramExpansions > budgets.maxParamExpansions) {
      return false;
    }
    decisionProbeSteps += 1;

    const request = resolveDecisionSequence(move, {
      budgets,
      ...(options?.onWarning === undefined ? {} : { onWarning: options.onWarning }),
    });

    if (request.complete) {
      if (
        !isFreeOperationGrantedForMove(
          def,
          authorizationState,
          request.move,
          seatResolution,
          { zoneFilterErrorSurface: 'turnFlowEligibility' },
        )
        || !isMoveAllowedByRequiredPendingFreeOperationGrant(
          def,
          authorizationState,
          request.move,
          seatResolution,
          { authorization: 'resolved' },
        )
        || !isCompletedProbeMoveCurrentlyLegal(def, authorizationState, request.move, seatResolution)
      ) {
        return false;
      }
      if (resolveStrongestRequiredFreeOperationOutcomeGrant(def, authorizationState, request.move, seatResolution) !== null) {
        return doesCompletedProbeMoveChangeGameplayState(def, authorizationState, request.move, seatResolution);
      }
      return true;
    }
    if (request.illegal !== undefined || request.stochasticDecision !== undefined) {
      return false;
    }
    const probeGrant = options?.selectionGrant
      ?? (authorizationState.turnOrderState.type === 'cardDriven'
        ? authorizationState.turnOrderState.runtime.pendingFreeOperationGrants?.find((grant) => grant.grantId === '__probe__') ?? null
        : null);
    const probeGrantStillPotential = probeGrant === null
      ? null
      : isFreeOperationPotentiallyGrantedForMove(def, authorizationState, request.move, seatResolution);
    if (
      probeGrantStillPotential === false
      || (
        probeGrantStillPotential === null
        && !isFreeOperationPotentiallyGrantedForMove(def, authorizationState, request.move, seatResolution)
      )
    ) {
      return false;
    }

    const nextDecision = request.nextDecision;
    if (nextDecision === undefined) {
      return false;
    }

    return visitSelectableDecisionValues(
      def,
      authorizationState,
      probeGrant,
      request.move,
      nextDecision,
      (selection) => {
        return visit({
          ...request.move,
          params: {
            ...request.move.params,
            [nextDecision.decisionKey]: selection,
          },
        });
      },
      { consumeParamExpansionBudget },
    );
  };

  return visit(baseMove);
};

export const canResolveAmbiguousFreeOperationOverlapInCurrentState = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  seatResolution: SeatResolutionContext,
  options?: {
    readonly onWarning?: (warning: RuntimeWarning) => void;
    readonly resolveDecisionSequence?: FreeOperationDecisionSequenceResolver;
  },
): boolean => {
  const analysis = resolveFreeOperationDiscoveryAnalysis(
    def,
    state,
    baseMove,
    seatResolution,
    { zoneFilterErrorSurface: 'turnFlowEligibility' },
  );
  if (analysis.denial.cause !== 'ambiguousOverlap') {
    return false;
  }

  const selectionGrant = state.turnOrderState.type === 'cardDriven'
    ? state.turnOrderState.runtime.pendingFreeOperationGrants?.find((grant) =>
      analysis.denial.ambiguousGrantIds?.includes(grant.grantId) === true)
      ?? null
    : null;

  return hasLegalCompletedProbeMove(
    def,
    state,
    state,
    baseMove,
    seatResolution,
    {
      ...(options?.onWarning === undefined ? {} : { onWarning: options.onWarning }),
      selectionGrant,
      ...(options?.resolveDecisionSequence === undefined ? {} : { resolveDecisionSequence: options.resolveDecisionSequence }),
    },
  );
};

export const hasLegalCompletedFreeOperationMoveInCurrentState = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  seatResolution: SeatResolutionContext,
  options?: {
    readonly budgets?: Partial<ReturnType<typeof resolveMoveEnumerationBudgets>>;
    readonly onWarning?: (warning: RuntimeWarning) => void;
    readonly resolveDecisionSequence?: FreeOperationDecisionSequenceResolver;
  },
): boolean => hasLegalCompletedProbeMove(
  def,
  state,
  state,
  baseMove,
  seatResolution,
  options,
);

export const isFreeOperationGrantUsableInCurrentState = (
  def: GameDef,
  state: GameState,
  grant: TurnFlowFreeOperationGrantContract,
  activeSeat: string,
  seatOrder: readonly string[],
  seatResolution: SeatResolutionContext,
  options?: {
    readonly budgets?: Partial<ReturnType<typeof resolveMoveEnumerationBudgets>>;
    readonly sequenceProbeBlockers?: readonly TurnFlowPendingFreeOperationGrant[];
    readonly sequenceProbeCandidates?: readonly TurnFlowFreeOperationGrantContract[];
    readonly evalContext?: ReadContext;
  },
): boolean => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return false;
  }

  const resolvedSeats = resolveProbeGrantSeats(grant, activeSeat, seatOrder);
  if (resolvedSeats === null) {
    return false;
  }
  const { seat, executeAsSeat } = resolvedSeats;
  const executionContext = options?.evalContext === undefined
    ? undefined
    : resolveFreeOperationExecutionContext(grant.executionContext, options.evalContext);

  const probeGrant = buildPendingFreeOperationGrant(grant, {
    grantId: '__probe__',
    seat,
    ...(executeAsSeat === undefined ? {} : { executeAsSeat }),
    ...(grant.sequence === undefined ? {} : { sequenceBatchId: '__probeBatch__' }),
    ...(executionContext === undefined ? {} : { executionContext }),
  });
  const probeBlockers = resolveUnusableSequenceProbeBlockers(
    def,
    state,
    grant,
    activeSeat,
    seatOrder,
    seatResolution,
    options?.sequenceProbeBlockers ?? [],
    options?.sequenceProbeCandidates ?? [],
    options?.evalContext,
  );
  const pendingProbeGrants = createProbeOverlay(probeBlockers, [probeGrant]);
  const probeGrantPhase = resolveProbeGrantPhase(runtime, pendingProbeGrants, probeGrant);
  const authorizedProbeGrant = probeGrantPhase === probeGrant.phase
    ? probeGrant
    : {
      ...probeGrant,
      phase: probeGrantPhase,
    };
  const authorizedPendingProbeGrants = createProbeOverlay(probeBlockers, [authorizedProbeGrant]);
  const probeActivePlayerIndex = resolvePlayerIndexForTurnFlowSeat(seat, seatResolution.index);
  const authorizationState: GameState = {
    ...state,
    ...(probeActivePlayerIndex === null ? {} : { activePlayer: asPlayerId(probeActivePlayerIndex) }),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: seat,
          secondEligible: null,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        pendingFreeOperationGrants: authorizedPendingProbeGrants,
      },
    },
  };
  const authorizationRuntime = authorizationState.turnOrderState.type === 'cardDriven'
    ? authorizationState.turnOrderState.runtime
    : null;
  if (authorizationRuntime === null) {
    return false;
  }
  const explorationState: GameState = {
    ...authorizationState,
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...authorizationRuntime,
        ...(authorizationRuntime.pendingFreeOperationGrants === undefined
          ? {}
          : {
            pendingFreeOperationGrants: stripZoneFilterFromProbeGrant(
              authorizationRuntime.pendingFreeOperationGrants,
              '__probe__',
            ),
          }),
      },
    },
  };
  const actionIds = resolveGrantFreeOperationActionDomain(def, probeGrant);
  for (const actionId of actionIds) {
    const actionIdBrand = asActionId(actionId);
    const probeMove: Move = {
      actionId: actionIdBrand,
      params: {},
      freeOperation: true,
      ...(resolveGrantMoveActionClassOverride(def, actionIdBrand, probeGrant.operationClass) === undefined
        ? {}
        : { actionClass: probeGrant.operationClass }),
    };
    if (!isFreeOperationApplicableForMove(def, explorationState, probeMove, seatResolution)) {
      continue;
    }
    if (
      classifyDecisionContinuationSatisfiability(
        def,
        explorationState,
        probeMove,
        {
          ...(options?.budgets === undefined ? {} : { budgets: options.budgets }),
        },
      ).classification === 'unsatisfiable'
    ) {
      continue;
    }
    if (hasLegalCompletedProbeMove(def, explorationState, authorizationState, probeMove, seatResolution, {
      ...(options?.budgets === undefined ? {} : { budgets: options.budgets }),
    })) {
      return true;
    }
  }

  return false;
};
