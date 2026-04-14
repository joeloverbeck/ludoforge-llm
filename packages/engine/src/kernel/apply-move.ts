import { incrementActionUsage } from './action-usage.js';
import { perfStart, perfEnd, type PerfProfiler } from './perf-profiler.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { applyBoundaryExpiry } from './boundary-expiry.js';
import { isEffectRuntimeReason } from './effect-error.js';
import { applyEffects } from './effects.js';
import {
  executeEventMove,
  shouldDeferIncompleteDecisionValidationForMove,
} from './event-execution.js';
import { createCollector } from './execution-collector.js';
import { evaluateConditionWithCache } from './compiled-condition-expr-cache.js';
import { resolveActionPipelineDispatch, toExecutionPipeline } from './apply-move-pipeline.js';
import { toApplyMoveIllegalReason } from './legality-outcome.js';
import {
  decideApplyMovePipelineViability,
  evaluatePipelinePredicateStatus,
  evaluateStagePredicateStatus,
} from './pipeline-viability-policy.js';
import { resolveActionExecutor } from './action-executor.js';
import { isDeclaredActionParamValueInDomain } from './declared-action-param-domain.js';
import { createEvalContext, createEvalRuntimeResources, type ReadContext, type EvalRuntimeResources } from './eval-context.js';
import {
  buildMoveRuntimeBindings,
  deriveDecisionBindingsFromMoveParams,
  resolvePipelineDecisionBindingsForMove,
} from './move-runtime-bindings.js';
import { EFFECT_RUNTIME_REASONS, ILLEGAL_MOVE_REASONS } from './runtime-reasons.js';
import { advanceToDecisionPoint } from './phase-advance.js';
import { consumeGrantUse, withPendingFreeOperationGrants } from './grant-lifecycle.js';
import {
  illegalMoveError,
  isKernelErrorCode,
  isKernelRuntimeError,
  kernelRuntimeError,
  type IllegalMoveContext,
  type KernelRuntimeError,
  type KernelRuntimeErrorCode,
  type KernelRuntimeErrorContext,
} from './runtime-error.js';
import { buildAdjacencyGraph } from './spatial.js';
import {
  advanceSequenceReadyPendingFreeOperationGrants,
  applyTurnFlowEligibilityAfterMove,
  hasActiveSeatRequiredPendingFreeOperationGrant,
  isMoveAllowedByRequiredPendingFreeOperationGrant,
  splitReadyDeferredEventEffects,
  toPendingDeferredEventEffects,
  toPendingFreeOperationGrants,
  trimFreeOperationSequenceContextsToPendingBatches,
  withFreeOperationSequenceContexts,
  withPendingDeferredEventEffects,
  withSuspendedCardEnd,
} from './turn-flow-eligibility.js';
import { resolveFreeOperationDiscoveryAnalysis } from './free-operation-discovery-analysis.js';
import {
  collectGrantMoveZoneCandidates,
  resolveAuthorizedPendingFreeOperationGrants,
} from './free-operation-grant-authorization.js';
import { resolveTurnFlowActionClassMismatch } from './turn-flow-action-class.js';
import { toFreeOperationDeniedCauseForLegality } from './free-operation-legality-policy.js';
import { applyTurnFlowWindowFilters, isMoveAllowedByTurnFlowOptionMatrix } from './legal-moves-turn-order.js';
import { isTurnFlowErrorCode } from './turn-flow-error.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import {
  authorizedFreeOperationGrantMissingInvariantMessage,
  makeAuthorizedFreeOperationGrantMissingInvariantContext,
} from './turn-flow-invariant-contracts.js';
import { selectorInvalidSpecError } from './selector-runtime-contract.js';
import { findPhaseDef } from './phase-lookup.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { toMoveExecutionPolicy } from './execution-policy.js';
import { createSeatResolutionContext } from './identity.js';
import { requireCardDrivenActiveSeat, validateTurnFlowRuntimeStateInvariants } from './turn-flow-runtime-invariants.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS } from './turn-flow-active-seat-invariant-surfaces.js';
import { createDeferredLifecycleTraceEntry } from './turn-flow-deferred-lifecycle-trace.js';
import { createExecutionEffectContext, type PhaseTransitionBudget } from './effect-context.js';
import { buildFreeOperationPreflightOverlay } from './free-operation-preflight-overlay.js';
import { doesCompletedProbeMoveChangeGameplayState } from './free-operation-viability.js';
import { doesMaterialGameplayStateChange, resolveStrongestRequiredFreeOperationOutcomeGrant } from './free-operation-outcome-policy.js';
import { createDraftTracker, createMutableState, freezeState, type DraftTracker, type MutableGameState } from './state-draft.js';
import type { SimultaneousMoveSubmission } from './types-turn-flow.js';
import type {
  ActionDef,
  ActionPipelineDef,
  ApplyMoveResult,
  ChoicePendingRequest,
  ChoiceStochasticPendingRequest,
  EventSideEffectManifest,
  ExecutionOptions,
  GameDef,
  GameState,
  Move,
  MoveParamScalar,
  MoveParamValue,
  Rng,
  RuntimeWarning,
  TrustedExecutableMove,
  TurnFlowReleasedDeferredEventEffect,
  TriggerLogEntry,
  TriggerEvent,
} from './types.js';
import { asPlayerId } from './branded.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { computeFullHash, createZobristTable } from './zobrist.js';
import { reconcileRunningHash } from './zobrist-phase-hash.js';
import { resolveMoveDecisionSequence, type DiscoveryCache } from './move-decision-sequence.js';

const DEFAULT_MAX_TRIGGER_DEPTH = 8;

const shouldVerifyHash = (options: ExecutionOptions | undefined, turnCount: number): boolean => {
  const flag = options?.verifyIncrementalHash;
  if (flag === undefined || flag === false) return false;
  if (flag === true) return true;
  return flag.interval > 0 && turnCount % flag.interval === 0;
};

const findAction = (def: GameDef, actionId: Move['actionId']): ActionDef | undefined =>
  def.actions.find((action) => action.id === actionId);

const decisionBindingsForMove = (
  actionPipeline: ActionPipelineDef | undefined,
  moveParams: Move['params'],
): Readonly<Record<string, MoveParamValue>> => {
  if (actionPipeline === undefined) {
    return deriveDecisionBindingsFromMoveParams(moveParams);
  }
  return resolvePipelineDecisionBindingsForMove(actionPipeline, moveParams);
};

const runtimeBindingsForMove = (
  move: Move,
  actionPipeline: ActionPipelineDef | undefined,
): Readonly<Record<string, MoveParamValue | boolean | string>> =>
  buildMoveRuntimeBindings(move, decisionBindingsForMove(actionPipeline, move.params));

interface FreeOperationGrantConsumptionResult {
  readonly state: GameState;
  readonly traceEntries: readonly TriggerLogEntry[];
  readonly releasedDeferredEventEffects: readonly TurnFlowReleasedDeferredEventEffect[];
  readonly consumedGrant?: {
    readonly postResolutionTurnFlow?: 'resumeCardFlow' | 'endCardNow';
  };
}

export const consumeAuthorizedFreeOperationGrant = (
  def: GameDef,
  authorizationState: GameState,
  state: GameState,
  move: Move,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
): FreeOperationGrantConsumptionResult => {
  if (move.freeOperation !== true || state.turnOrderState.type !== 'cardDriven') {
    return { state, traceEntries: [], releasedDeferredEventEffects: [] };
  }
  const runtime = state.turnOrderState.runtime;
  const authorizationRuntime =
    authorizationState.turnOrderState.type === 'cardDriven'
      ? authorizationState.turnOrderState.runtime
      : null;
  if (authorizationRuntime === null) {
    return { state, traceEntries: [], releasedDeferredEventEffects: [] };
  }
  const activeSeat = requireCardDrivenActiveSeat(
    def,
    authorizationState,
    TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_CONSUMPTION,
    seatResolution,
  );
  const authorizationPending = authorizationRuntime.pendingFreeOperationGrants ?? [];
  const authorizedGrant = resolveAuthorizedPendingFreeOperationGrants(
    def,
    authorizationState,
    authorizationPending,
    activeSeat,
    move,
  ).canonicalGrant;
  if (authorizedGrant === null) {
    return { state, traceEntries: [], releasedDeferredEventEffects: [] };
  }

  const runtimePending = runtime.pendingFreeOperationGrants ?? [];
  const consumedIndex = runtimePending.findIndex((grant) => grant.grantId === authorizedGrant.grantId);
  if (consumedIndex < 0) {
    const context = makeAuthorizedFreeOperationGrantMissingInvariantContext({
      actionId: String(move.actionId),
      activeSeat,
      authorizedGrantId: authorizedGrant.grantId,
      authorizationPendingGrantIds: authorizationPending.map((grant) => grant.grantId),
      runtimePendingGrantIds: runtimePending.map((grant) => grant.grantId),
    });
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      authorizedFreeOperationGrantMissingInvariantMessage(context),
      context,
    );
  }

  const consumedGrant = runtimePending[consumedIndex]!;
  const consumedTransition = consumeGrantUse(runtimePending, consumedGrant.grantId);
  const nextPending = consumedTransition.grants;
  const captureKey = consumedGrant.sequenceContext?.captureMoveZoneCandidatesAs;
  const capturedZones = captureKey === undefined
    ? []
    : collectGrantMoveZoneCandidates(def, authorizationState, move, consumedGrant);
  const capturedBatchId = consumedGrant.sequenceBatchId;
  const baseSequenceContexts = runtime.freeOperationSequenceContexts;
  const nextSequenceContexts = captureKey === undefined || capturedBatchId === undefined
    ? trimFreeOperationSequenceContextsToPendingBatches(baseSequenceContexts, nextPending)
    : trimFreeOperationSequenceContextsToPendingBatches({
        ...(baseSequenceContexts ?? {}),
        [capturedBatchId]: {
          capturedMoveZonesByKey: {
            ...(baseSequenceContexts?.[capturedBatchId]?.capturedMoveZonesByKey ?? {}),
            [captureKey]: [...capturedZones],
          },
          progressionPolicy: baseSequenceContexts?.[capturedBatchId]?.progressionPolicy ?? 'strictInOrder',
          skippedStepIndices: baseSequenceContexts?.[capturedBatchId]?.skippedStepIndices ?? [],
        },
      }, nextPending);
  const sequenceAdvanced = advanceSequenceReadyPendingFreeOperationGrants(
    nextPending,
    nextSequenceContexts,
  );
  const splitDeferred = splitReadyDeferredEventEffects(
    runtime.pendingDeferredEventEffects ?? [],
    sequenceAdvanced.grants,
  );
  const traceEntries: TriggerLogEntry[] = [
    ...consumedTransition.trace,
    ...sequenceAdvanced.traceEntries,
    ...splitDeferred.ready.map<TriggerLogEntry>((released) =>
      createDeferredLifecycleTraceEntry('released', released)),
  ];

  return {
    state: {
      ...state,
      turnOrderState: {
        type: 'cardDriven',
        runtime: withPendingDeferredEventEffects(
          withFreeOperationSequenceContexts(
            withPendingFreeOperationGrants(
              withSuspendedCardEnd({ ...runtime }, runtime.suspendedCardEnd),
              toPendingFreeOperationGrants(sequenceAdvanced.grants),
            ),
            nextSequenceContexts,
          ),
          toPendingDeferredEventEffects(splitDeferred.remaining),
        ),
      },
    },
    traceEntries,
    releasedDeferredEventEffects: splitDeferred.ready,
    consumedGrant,
  };
};

const canonicalTurnFlowMove = (
  move: Move,
  actionPipeline: ActionPipelineDef | undefined,
): Move => ({
  ...move,
  params: {
    ...decisionBindingsForMove(actionPipeline, move.params),
    ...move.params,
  },
});

/**
 * Enforcement half of the free-operation outcome-policy contract.
 *
 * `legal-moves.ts` surfaces required grants even when `mustChangeGameplayState`
 * cannot yet be proven, so the obligation stays visible during enumeration.
 * This apply-time check is the authoritative gate that rejects completed
 * free operations which still fail to materially change gameplay state.
 */
const validateFreeOperationOutcomePolicy = (
  def: GameDef,
  beforeState: GameState,
  afterActionState: GameState,
  move: Move,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
): void => {
  const strongestOutcomeGrant = resolveStrongestRequiredFreeOperationOutcomeGrant(def, beforeState, move, seatResolution);
  if (strongestOutcomeGrant === null) {
    return;
  }
  if (!doesMaterialGameplayStateChange(def, beforeState, afterActionState)) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED, {
      grantId: strongestOutcomeGrant.grantId,
      outcomePolicy: 'mustChangeGameplayState',
    });
  }
};

const resolveMatchedPipelineForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
  evalRuntimeResources: EvalRuntimeResources,
  cachedRuntime?: GameDefRuntime,
): ActionPipelineDef | undefined => {
  const action = findAction(def, move.actionId);
  if (action === undefined) {
    return undefined;
  }
  const adjacencyGraph = cachedRuntime?.adjacencyGraph ?? buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = cachedRuntime?.runtimeTableIndex ?? buildRuntimeTableIndex(def);
  const freeOperationAnalysis = move.freeOperation === true
    ? resolveFreeOperationDiscoveryAnalysis(def, state, move, seatResolution, { zoneFilterErrorSurface: 'turnFlowEligibility' })
    : null;
  const executionPlayer = freeOperationAnalysis?.executionPlayer ?? (() => {
      const resolution = resolveActionExecutor({
        def,
        state,
        adjacencyGraph,
        action,
        decisionPlayer: state.activePlayer,
        bindings: runtimeBindingsForMove(move, undefined),
        runtimeTableIndex,
        evalRuntimeResources,
      });
      if (resolution.kind === 'notApplicable') {
        return null;
      }
      if (resolution.kind === 'invalidSpec') {
        throw selectorInvalidSpecError('applyMove', 'executor', action, resolution.error);
      }
      return resolution.executionPlayer;
    })();
  if (executionPlayer === null) {
    return undefined;
  }
  const freeOperationPreflightOverlay = buildFreeOperationPreflightOverlay(
    freeOperationAnalysis,
    move,
    'turnFlowEligibility',
  );
  const dispatch = resolveActionPipelineDispatch(def, action, createEvalContext({
    def,
    adjacencyGraph,
    runtimeTableIndex,
    state,
    activePlayer: executionPlayer,
    actorPlayer: executionPlayer,
    bindings: runtimeBindingsForMove(move, undefined),
    resources: evalRuntimeResources,
    ...(freeOperationPreflightOverlay.freeOperationOverlay === undefined
      ? {}
      : { freeOperationOverlay: freeOperationPreflightOverlay.freeOperationOverlay }),
  }));
  if (dispatch.kind !== 'matched') {
    return undefined;
  }
  return dispatch.profile;
};

type MoveFreeOperationAnalysis = ReturnType<typeof resolveFreeOperationDiscoveryAnalysis>;

const resolveMoveFreeOperationAnalysis = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
): MoveFreeOperationAnalysis | null =>
  move.freeOperation === true
    ? resolveFreeOperationDiscoveryAnalysis(def, state, move, seatResolution, { zoneFilterErrorSurface: 'turnFlowEligibility' })
    : null;

const operationAllowsSpecialActivity = (
  operationActionId: Move['actionId'],
  accompanyingOps: 'any' | readonly string[] | undefined,
): boolean => {
  if (accompanyingOps === undefined || accompanyingOps === 'any') {
    return true;
  }
  return accompanyingOps.includes(String(operationActionId));
};

const validateCompoundTimingConfiguration = (
  move: Move,
  executionProfile: ReturnType<typeof toExecutionPipeline> | undefined,
  actionPipeline: ActionPipelineDef | undefined,
): void => {
  if (move.compound === undefined) {
    return;
  }
  const { timing, insertAfterStage, replaceRemainingStages } = move.compound;
  if (timing !== 'during' && insertAfterStage !== undefined) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID, {
      timing,
      invalidField: 'insertAfterStage',
      detail: 'insertAfterStage requires timing=during',
    });
  }
  if (timing !== 'during' && replaceRemainingStages !== undefined) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID, {
      timing,
      invalidField: 'replaceRemainingStages',
      detail: 'replaceRemainingStages requires timing=during',
    });
  }
  if (timing === 'during' && executionProfile === undefined) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID, {
      timing,
      detail: 'timing=during requires a matched staged action pipeline',
    });
  }
  if (timing === 'during' && actionPipeline !== undefined && actionPipeline.stages.length === 0) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID, {
      timing,
      invalidField: 'insertAfterStage',
      insertAfterStage: insertAfterStage ?? 0,
      stageCount: 0,
      detail: 'timing=during requires an action pipeline with at least one declared stage',
    });
  }
  if (timing === 'during' && executionProfile !== undefined) {
    const stageCount = executionProfile.resolutionStages.length;
    const resolvedInsertAfterStage = insertAfterStage ?? 0;
    if (resolvedInsertAfterStage >= stageCount) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID, {
        timing,
        invalidField: 'insertAfterStage',
        insertAfterStage: resolvedInsertAfterStage,
        stageCount,
        detail: 'insertAfterStage must reference an existing stage index',
      });
    }
  }
};

const toParamValueSet = (
  value: MoveParamValue | undefined,
): ReadonlySet<MoveParamScalar> => {
  const values = new Set<MoveParamScalar>();
  if (value === undefined) {
    return values;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      values.add(entry as MoveParamScalar);
    }
    return values;
  }
  values.add(value as MoveParamScalar);
  return values;
};

const violatesCompoundParamConstraints = (
  operationMove: Move,
  specialActivityMove: Move,
  saPipeline: ActionPipelineDef,
): {
  readonly operationParam: string;
  readonly specialActivityParam: string;
  readonly relation: 'disjoint' | 'subset';
} | null => {
  const constraints = saPipeline.compoundParamConstraints;
  if (constraints === undefined || constraints.length === 0) {
    return null;
  }
  for (const constraint of constraints) {
    const left = toParamValueSet(operationMove.params[constraint.operationParam]);
    const right = toParamValueSet(specialActivityMove.params[constraint.specialActivityParam]);
    if (constraint.relation === 'disjoint') {
      if (left.size === 0 || right.size === 0) {
        continue;
      }
      const overlaps = [...left].some((entry) => right.has(entry));
      if (overlaps) {
        return constraint;
      }
      continue;
    }
    if (constraint.relation === 'subset') {
      if (right.size === 0) {
        continue;
      }
      const isSubset = [...right].every((entry) => left.has(entry));
      if (!isSubset) {
        return constraint;
      }
    }
  }
  return null;
};

const validateDecisionSequenceForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: { readonly allowIncomplete?: boolean },
  runtime?: GameDefRuntime,
): void => {
  try {
    const result = resolveMoveDecisionSequence(def, state, move, {
      choose: () => undefined,
    }, runtime);
    if (result.complete) {
      return;
    }
    if (result.illegal !== undefined) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE, {
        detail: result.illegal.reason,
      });
    }
    if (result.stochasticDecision !== undefined && (result.nextDecisionSet?.length ?? 0) === 0) {
      return;
    }
    if (options?.allowIncomplete === true) {
      return;
    }
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_HAS_INCOMPLETE_PARAMS, {
      ...(result.nextDecision?.decisionKey === undefined ? {} : { nextDecisionKey: result.nextDecision.decisionKey }),
      ...(result.nextDecision?.name === undefined ? {} : { nextDecisionName: result.nextDecision.name }),
      ...(result.nextDecisionSet === undefined ? {} : { nextDecisionSetSize: result.nextDecisionSet.length }),
      ...(result.stochasticDecision === undefined ? {} : { decisionUncertaintySource: result.stochasticDecision.source }),
    });
  } catch (err) {
    if (isEffectRuntimeReason(err, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID, {
        detail: err.message,
      });
    }
    if (isKernelErrorCode(err, 'LEGAL_CHOICES_VALIDATION_FAILED')) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID, {
        detail: err.message,
      });
    }
    if (isKernelRuntimeError(err)) {
      throw err;
    }
    if (isTurnFlowErrorCode(err, 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED')) {
      throw err;
    }
    throw err;
  }
};

const validateDeclaredActionParams = (action: ActionDef, evalCtx: ReadContext, move: Move): void => {
  for (const param of action.params) {
    if (!isDeclaredActionParamValueInDomain(param, move.params[param.name], evalCtx)) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION);
    }
  }
};

interface ValidatedMoveContext {
  readonly preflight: MovePreflightContext;
}

export type MoveLegalityProbeResult =
  | Readonly<{ readonly legal: true }>
  | Readonly<{
      readonly legal: false;
      readonly code: 'ILLEGAL_MOVE';
      readonly context: IllegalMoveContext;
      readonly error: KernelRuntimeError<'ILLEGAL_MOVE'>;
    }>
  | Readonly<{
      readonly legal: false;
      readonly code: Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>;
      readonly context?: KernelRuntimeErrorContext<Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>>;
      readonly error: KernelRuntimeError<Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>>;
    }>;

/**
 * Canonical shape: viable, complete, move, warnings, code, context, error,
 * nextDecision, nextDecisionSet, stochasticDecision.
 * All construction sites must materialize every property.
 */
export type MoveViabilityProbeResult =
  | Readonly<{
      readonly viable: true;
      readonly complete: true;
      readonly move: Move;
      readonly warnings: readonly RuntimeWarning[];
      readonly code: undefined;
      readonly context: undefined;
      readonly error: undefined;
      readonly nextDecision: undefined;
      readonly nextDecisionSet: undefined;
      readonly stochasticDecision: undefined;
    }>
  | Readonly<{
      readonly viable: true;
      readonly complete: false;
      readonly move: Move;
      readonly warnings: readonly RuntimeWarning[];
      readonly code: undefined;
      readonly context: undefined;
      readonly error: undefined;
      readonly nextDecision: ChoicePendingRequest | undefined;
      readonly nextDecisionSet: readonly ChoicePendingRequest[] | undefined;
      readonly stochasticDecision: ChoiceStochasticPendingRequest | undefined;
    }>
  | Readonly<{
      readonly viable: false;
      readonly complete: undefined;
      readonly move: undefined;
      readonly warnings: undefined;
      readonly code: 'ILLEGAL_MOVE';
      readonly context: IllegalMoveContext;
      readonly error: KernelRuntimeError<'ILLEGAL_MOVE'>;
      readonly nextDecision: undefined;
      readonly nextDecisionSet: undefined;
      readonly stochasticDecision: undefined;
    }>
  | Readonly<{
      readonly viable: false;
      readonly complete: undefined;
      readonly move: undefined;
      readonly warnings: undefined;
      readonly code: Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>;
      readonly context: KernelRuntimeErrorContext<Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>> | undefined;
      readonly error: KernelRuntimeError<Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>>;
      readonly nextDecision: undefined;
      readonly nextDecisionSet: undefined;
      readonly stochasticDecision: undefined;
    }>;

interface MovePreflightContext {
  readonly action: ActionDef;
  readonly executionPlayer: GameState['activePlayer'];
  readonly evalCtx: ReadContext;
  readonly baseBindings: Readonly<Record<string, MoveParamValue | boolean | string>>;
  readonly actionPipeline: ActionPipelineDef | undefined;
  readonly executionProfile: ReturnType<typeof toExecutionPipeline> | undefined;
  readonly costValidationPassed: boolean;
  readonly isFreeOperationPipeline: boolean;
}

const validateTurnFlowWindowAccess = (
  def: GameDef,
  state: GameState,
  move: Move,
  actionPipeline: ActionPipelineDef | undefined,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
): void => {
  const turnFlowMove = canonicalTurnFlowMove(move, actionPipeline);
  if (!isMoveAllowedByTurnFlowOptionMatrix(def, state, move)) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE, {
      detail: 'turnFlow option matrix rejected move action class',
    });
  }
  if (applyTurnFlowWindowFilters(def, state, [turnFlowMove], seatResolution).length === 0) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE, {
      detail: 'turnFlow window filters rejected move',
    });
  }
};

const validateSpecialActivityCompoundParamConstraints = (
  def: GameDef,
  state: GameState,
  move: Move,
  action: ActionDef,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
  evalRuntimeResources: EvalRuntimeResources,
  cachedRuntime?: GameDefRuntime,
): void => {
  if (move.compound === undefined) {
    return;
  }
  const saMove = move.compound.specialActivity;
  const saPipeline = resolveMatchedPipelineForMove(def, state, saMove, seatResolution, evalRuntimeResources, cachedRuntime);
  if (saPipeline !== undefined) {
    const violated = violatesCompoundParamConstraints(move, saMove, saPipeline);
    if (violated !== null) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED, {
        operationActionId: action.id,
        specialActivityActionId: saMove.actionId,
        profileId: saPipeline.id,
        relation: violated.relation,
        operationParam: violated.operationParam,
        specialActivityParam: violated.specialActivityParam,
      });
    }
  }
};

const resolvePipelineCostValidationStatus = (
  move: Move,
  action: ActionDef,
  pipeline: ActionPipelineDef | undefined,
  evalCtx: ReadContext,
  isFreeOperationPipeline: boolean,
): boolean => {
  if (pipeline === undefined) {
    return true;
  }
  const status = evaluatePipelinePredicateStatus(action, pipeline, evalCtx);
  const viabilityDecision = decideApplyMovePipelineViability(status, { isFreeOperation: isFreeOperationPipeline });
  if (viabilityDecision.kind === 'illegalMove') {
    const metadata = {
      profileId: pipeline.id,
    };
    if (viabilityDecision.outcome === 'pipelineAtomicCostValidationFailed') {
      throw illegalMoveError(move, toApplyMoveIllegalReason(viabilityDecision.outcome), {
        ...metadata,
        partialExecutionMode: pipeline.atomicity,
      });
    }
    throw illegalMoveError(move, toApplyMoveIllegalReason(viabilityDecision.outcome), {
      ...metadata,
    });
  }
  return viabilityDecision.costValidationPassed;
};

const resolveMovePreflightContext = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
  adjacencyGraph: ReturnType<typeof buildAdjacencyGraph>,
  runtimeTableIndex: ReturnType<typeof buildRuntimeTableIndex>,
  evalRuntimeResources: EvalRuntimeResources,
  mode: 'validation' | 'execution',
  cachedRuntime?: GameDefRuntime,
  freeOperationAnalysis?: MoveFreeOperationAnalysis | null,
): MovePreflightContext => {
  const action = findAction(def, move.actionId);
  if (action === undefined) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID);
  }
  const resolvedFreeOperationAnalysis = move.freeOperation === true
    ? (freeOperationAnalysis ?? resolveMoveFreeOperationAnalysis(def, state, move, seatResolution))
    : null;
  const baseBindings = runtimeBindingsForMove(move, undefined);
  const preflightEvalCtx = mode === 'validation'
    ? (() => {
      const freeOperationPreflightOverlay = buildFreeOperationPreflightOverlay(
        resolvedFreeOperationAnalysis,
        move,
        'turnFlowEligibility',
      );
      const preflight = resolveActionApplicabilityPreflight({
        def,
        state,
        action,
        adjacencyGraph,
        decisionPlayer: state.activePlayer,
        bindings: baseBindings,
        runtimeTableIndex,
        evalRuntimeResources,
        ...freeOperationPreflightOverlay,
      });
      if (preflight.kind === 'invalidSpec') {
        throw selectorInvalidSpecError(
          'applyMove',
          preflight.selector,
          action,
          preflight.error,
          preflight.selectorContractViolations,
        );
      }
      if (preflight.kind === 'notApplicable') {
        throw illegalMoveError(move, toApplyMoveIllegalReason(preflight.reason));
      }
      return {
        executionPlayer: preflight.executionPlayer,
        evalCtx: preflight.evalCtx,
        actionPipeline: preflight.pipelineDispatch.kind === 'matched'
          ? preflight.pipelineDispatch.profile
          : undefined,
      };
    })()
    : (() => {
      const executionPlayer = move.freeOperation === true
        ? resolvedFreeOperationAnalysis?.executionPlayer ?? state.activePlayer
        : (() => {
          const resolution = resolveActionExecutor({
            def,
            state,
            adjacencyGraph,
            action,
            decisionPlayer: state.activePlayer,
            bindings: baseBindings,
            runtimeTableIndex,
            evalRuntimeResources,
          });
          if (resolution.kind === 'notApplicable') {
            throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_EXECUTOR_NOT_APPLICABLE);
          }
          if (resolution.kind === 'invalidSpec') {
            throw selectorInvalidSpecError('applyMove', 'executor', action, resolution.error);
          }
          return resolution.executionPlayer;
        })();
      const freeOperationPreflightOverlay = buildFreeOperationPreflightOverlay(
        resolvedFreeOperationAnalysis,
        move,
        'turnFlowEligibility',
      );
      const evalCtx = createEvalContext({
        def,
        adjacencyGraph,
        runtimeTableIndex,
        state,
        activePlayer: executionPlayer,
        actorPlayer: executionPlayer,
        bindings: baseBindings,
        resources: evalRuntimeResources,
        ...(freeOperationPreflightOverlay.freeOperationOverlay === undefined
          ? {}
          : { freeOperationOverlay: freeOperationPreflightOverlay.freeOperationOverlay }),
      });
      const pipelineDispatch = resolveActionPipelineDispatch(def, action, evalCtx);
      if (pipelineDispatch.kind === 'configuredNoMatch') {
        throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE);
      }
      return {
        executionPlayer,
        evalCtx,
        actionPipeline: pipelineDispatch.kind === 'matched' ? pipelineDispatch.profile : undefined,
      };
    })();

  const actionPipeline = preflightEvalCtx.actionPipeline;
  const executionProfile = actionPipeline === undefined
    ? undefined
    : toExecutionPipeline(action, actionPipeline);
  validateCompoundTimingConfiguration(move, executionProfile, actionPipeline);
  validateSpecialActivityCompoundParamConstraints(def, state, move, action, seatResolution, evalRuntimeResources, cachedRuntime);

  const isFreeOperationPipeline = move.freeOperation === true && executionProfile !== undefined;
  const costValidationPassed = resolvePipelineCostValidationStatus(
    move,
    action,
    actionPipeline,
    preflightEvalCtx.evalCtx,
    isFreeOperationPipeline,
  );

  return {
    action,
    executionPlayer: preflightEvalCtx.executionPlayer,
    evalCtx: preflightEvalCtx.evalCtx,
    baseBindings,
    actionPipeline,
    executionProfile,
    costValidationPassed,
    isFreeOperationPipeline,
  };
};

const validateMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
  evalRuntimeResources: EvalRuntimeResources,
  cachedRuntime?: GameDefRuntime,
): ValidatedMoveContext => {
  const classMismatch = resolveTurnFlowActionClassMismatch(def, move);
  if (classMismatch !== null) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH, {
      mappedActionClass: classMismatch.mapped,
      submittedActionClass: classMismatch.submitted,
    });
  }
  const freeOperationAnalysis = resolveMoveFreeOperationAnalysis(def, state, move, seatResolution);
  const deniedFreeOperationCause = freeOperationAnalysis === null
    ? null
    : toFreeOperationDeniedCauseForLegality(freeOperationAnalysis.denial.cause);
  if (move.freeOperation === true && freeOperationAnalysis !== null && deniedFreeOperationCause !== null) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED, {
      freeOperationDenial: freeOperationAnalysis.denial,
    });
  }
  if (
    hasActiveSeatRequiredPendingFreeOperationGrant(def, state, seatResolution)
    && !isMoveAllowedByRequiredPendingFreeOperationGrant(def, state, move, seatResolution)
  ) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE, {
      detail: 'active seat has unresolved required free-operation grants',
    });
  }
  if (move.compound !== undefined) {
    const saMove = move.compound.specialActivity;
    const saPipeline = resolveMatchedPipelineForMove(def, state, saMove, seatResolution, evalRuntimeResources, cachedRuntime);
    if (saPipeline !== undefined && !operationAllowsSpecialActivity(move.actionId, saPipeline.accompanyingOps)) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED, {
        operationActionId: move.actionId,
        specialActivityActionId: saMove.actionId,
        profileId: saPipeline.id,
      });
    }
  }
  const adjacencyGraph = cachedRuntime?.adjacencyGraph ?? buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = cachedRuntime?.runtimeTableIndex ?? buildRuntimeTableIndex(def);
  const preflight = resolveMovePreflightContext(
    def,
    state,
    move,
    seatResolution,
    adjacencyGraph,
    runtimeTableIndex,
    evalRuntimeResources,
    'validation',
    cachedRuntime,
    freeOperationAnalysis,
  );
  const action = preflight.action;
  const allowIncomplete = shouldDeferIncompleteDecisionValidationForMove(def, state, move);
  if (action.pre !== null && !evaluateConditionWithCache(action.pre, preflight.evalCtx)) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE);
  }
  if (preflight.actionPipeline === undefined) {
    validateDeclaredActionParams(action, preflight.evalCtx, move);
  }
  validateDecisionSequenceForMove(def, state, move, {
    allowIncomplete,
  }, cachedRuntime);
  validateTurnFlowWindowAccess(def, state, move, preflight.actionPipeline, seatResolution);
  return {
    preflight,
  };
};

interface ApplyMoveCoreOptions {
  readonly skipValidation?: boolean;
  readonly skipAdvanceToDecisionPoint?: boolean;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  readonly executionRuntime?: MoveExecutionRuntime;
}

interface SharedMoveExecutionContext {
  readonly adjacencyGraph: ReturnType<typeof buildAdjacencyGraph>;
  readonly runtimeTableIndex: ReturnType<typeof buildRuntimeTableIndex>;
  readonly evalRuntimeResources: EvalRuntimeResources;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  readonly executionPolicy?: ReturnType<typeof toMoveExecutionPolicy>;
  readonly cachedRuntime?: GameDefRuntime;
}

interface MoveActionExecutionResult {
  readonly stateWithRng: GameState;
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly sideEffectManifest?: EventSideEffectManifest;
}

interface MoveExecutionRuntime {
  readonly collector: ReturnType<typeof createCollector>;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  readonly executionPolicy?: ReturnType<typeof toMoveExecutionPolicy>;
}

const validatedMaxPhaseTransitionsPerMove = (options?: ExecutionOptions): number | undefined => {
  const maxPhaseTransitionsPerMove = options?.maxPhaseTransitionsPerMove;
  if (
    maxPhaseTransitionsPerMove !== undefined
    && (!Number.isSafeInteger(maxPhaseTransitionsPerMove) || maxPhaseTransitionsPerMove < 0)
  ) {
    throw new RangeError(`maxPhaseTransitionsPerMove must be a non-negative safe integer, received ${String(maxPhaseTransitionsPerMove)}`);
  }
  return maxPhaseTransitionsPerMove;
};

const resolvePhaseTransitionBudget = (
  options: ExecutionOptions | undefined,
  existing?: PhaseTransitionBudget,
): PhaseTransitionBudget | undefined => {
  if (existing !== undefined) {
    validatedMaxPhaseTransitionsPerMove(options);
    return existing;
  }
  const maxPhaseTransitionsPerMove = validatedMaxPhaseTransitionsPerMove(options);
  return maxPhaseTransitionsPerMove === undefined
    ? undefined
    : { remaining: maxPhaseTransitionsPerMove };
};

const createMoveExecutionRuntime = (
  options: ExecutionOptions | undefined,
  existingBudget?: PhaseTransitionBudget,
): MoveExecutionRuntime => {
  const phaseTransitionBudget = resolvePhaseTransitionBudget(options, existingBudget);
  const executionPolicy = toMoveExecutionPolicy(options, phaseTransitionBudget);
  return {
    collector: createCollector(options),
    ...(phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget }),
    ...(executionPolicy === undefined ? {} : { executionPolicy }),
  };
};

const executeMoveAction = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
  options: ExecutionOptions | undefined,
  coreOptions: ApplyMoveCoreOptions | undefined,
  shared: SharedMoveExecutionContext,
  tracker?: DraftTracker,
  cachedRuntime?: GameDefRuntime,
): MoveActionExecutionResult => {
  const profiler: PerfProfiler | undefined = options?.profiler;

  const t0_val = perfStart(profiler);
  const validated = coreOptions?.skipValidation === true
    ? null
    : validateMove(def, state, move, seatResolution, shared.evalRuntimeResources, cachedRuntime);
  perfEnd(profiler, 'validateMove', t0_val);

  const t0_pre = perfStart(profiler);
  const freeOperationAnalysis = validated === null
    ? resolveMoveFreeOperationAnalysis(def, state, move, seatResolution)
    : null;
  const preflight = validated?.preflight ?? resolveMovePreflightContext(
    def,
    state,
    move,
    seatResolution,
    shared.adjacencyGraph,
    shared.runtimeTableIndex,
    shared.evalRuntimeResources,
    'execution',
    cachedRuntime,
    freeOperationAnalysis,
  );
  perfEnd(profiler, 'resolvePreflight', t0_pre);
  const {
    action,
    executionPlayer,
    baseBindings,
    actionPipeline,
    executionProfile,
    costValidationPassed,
    isFreeOperationPipeline,
  } = preflight;

  const rng: Rng = { state: state.rng };
  const effectCtxBase = {
    def,
    adjacencyGraph: shared.adjacencyGraph,
    runtimeTableIndex: shared.runtimeTableIndex,
    activePlayer: executionPlayer,
    actorPlayer: executionPlayer,
    bindings: baseBindings,
    moveParams: move.params,
    resources: shared.evalRuntimeResources,
    ...(cachedRuntime === undefined ? {} : { cachedRuntime }),
    ...(options?.verifyCompiledEffects === undefined ? {} : { verifyCompiledEffects: options.verifyCompiledEffects }),
    ...(shared.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: shared.phaseTransitionBudget }),
    ...(profiler === undefined ? {} : { profiler }),
  } as const;
  const resolvedDecisionBindings = decisionBindingsForMove(actionPipeline, move.params);
  const runtimeMoveParams = {
    ...move.params,
    ...resolvedDecisionBindings,
  };
  const freeOperationOverlay = buildFreeOperationPreflightOverlay(
    move.freeOperation === true
      ? (freeOperationAnalysis ?? resolveMoveFreeOperationAnalysis(def, state, move, seatResolution))
      : null,
    move,
    'turnFlowEligibility',
  );
  const effectCtx = {
    ...effectCtxBase,
    bindings: buildMoveRuntimeBindings(move, resolvedDecisionBindings),
    moveParams: runtimeMoveParams,
    ...(freeOperationOverlay.freeOperationOverlay === undefined
      ? {}
      : { freeOperationOverlay: freeOperationOverlay.freeOperationOverlay }),
  } as const;
  let progressedBindings: Readonly<Record<string, unknown>> = effectCtx.bindings;

  const shouldSpendCost = !isFreeOperationPipeline && (
    executionProfile === undefined ||
    executionProfile.costValidation === null ||
    costValidationPassed);
  const costEffects = executionProfile?.costSpend ?? action.cost;
  const costResult = shouldSpendCost
    ? applyEffects(costEffects, createExecutionEffectContext({
      ...effectCtx,
      state,
      rng,
      traceContext: {
        eventContext: 'actionCost',
        actionId: String(action.id),
        effectPathRoot: `action:${String(action.id)}.cost`,
      },
      effectPath: '',
      ...(tracker === undefined ? {} : { tracker }),
    }))
    : { state, rng };

  let effectState = costResult.state;
  let effectRng = costResult.rng;
  const emittedEvents: TriggerEvent[] = [];
  const executionTraceEntries: TriggerLogEntry[] = [];

  if (isFreeOperationPipeline) {
    executionTraceEntries.push({
      kind: 'operationFree',
      actionId: action.id,
      step: 'costSpendSkipped',
    });
  } else if (executionProfile !== undefined && executionProfile.partialMode === 'partial' && !costValidationPassed) {
    executionTraceEntries.push({
      kind: 'operationPartial',
      actionId: action.id,
      profileId: executionProfile.profileId,
      step: 'costSpendSkipped',
      reason: 'costValidationFailed',
    });
  }

  const applyCompoundSA = (): void => {
    if (move.compound === undefined) return;
    const saResult = executeMoveAction(
      def,
      effectState,
      move.compound.specialActivity,
      seatResolution,
      options,
      shared.phaseTransitionBudget === undefined ? undefined : { phaseTransitionBudget: shared.phaseTransitionBudget },
      shared,
      tracker,
      cachedRuntime,
    );
    effectState = saResult.stateWithRng;
    effectRng = { state: effectState.rng };
    executionTraceEntries.push(...saResult.triggerFirings);
  };

  const originatingPhaseDef = findPhaseDef(def, effectState.currentPhase);

  if (move.compound?.timing === 'before') {
    applyCompoundSA();
  }

  const t0_actionEffects = perfStart(profiler);
  if (executionProfile === undefined) {
    const effectResult = applyEffects(action.effects, createExecutionEffectContext({
      ...effectCtx,
      state: effectState,
      rng: effectRng,
      traceContext: {
        eventContext: 'actionEffect',
        actionId: String(action.id),
        effectPathRoot: `action:${String(action.id)}.effects`,
      },
      effectPath: '',
      ...(tracker === undefined ? {} : { tracker }),
    }));
    effectState = effectResult.state;
    effectRng = effectResult.rng;
    if (effectResult.emittedEvents !== undefined) {
      emittedEvents.push(...effectResult.emittedEvents);
    }
  } else {
    const insertAfter = move.compound?.timing === 'during' ? (move.compound.insertAfterStage ?? 0) : -1;
    for (const [stageIdx, stage] of executionProfile.resolutionStages.entries()) {
      const stageEvalCtx: ReadContext = {
        ...preflight.evalCtx,
        state: effectState,
        bindings: progressedBindings,
      };
      const stageStatus = evaluateStagePredicateStatus(
        action,
        executionProfile.profileId,
        stage,
        executionProfile.partialMode,
        stageEvalCtx,
        { includeCostValidation: !isFreeOperationPipeline },
      );
      const stageViability = decideApplyMovePipelineViability(stageStatus, {
        isFreeOperation: isFreeOperationPipeline,
      });
      if (stageViability.kind === 'illegalMove') {
        throw illegalMoveError(
          move,
          toApplyMoveIllegalReason(stageViability.outcome),
          stageViability.outcome === 'pipelineAtomicCostValidationFailed'
            ? { profileId: executionProfile.profileId, partialExecutionMode: executionProfile.partialMode }
            : { profileId: executionProfile.profileId },
        );
      }
      if (!stageViability.costValidationPassed) {
        continue;
      }
      const stageResult = applyEffects(stage.effects, createExecutionEffectContext({
        ...effectCtx,
        bindings: progressedBindings,
        state: effectState,
        rng: effectRng,
        traceContext: {
          eventContext: 'actionEffect',
          actionId: String(action.id),
          effectPathRoot: `action:${String(action.id)}.stages[${stageIdx}]`,
        },
        effectPath: '',
        ...(tracker === undefined ? {} : { tracker }),
      }));
      effectState = stageResult.state;
      effectRng = stageResult.rng;
      progressedBindings = stageResult.bindings ?? progressedBindings;
      if (stageResult.emittedEvents !== undefined) {
        emittedEvents.push(...stageResult.emittedEvents);
      }
      if (stageIdx === insertAfter) {
        applyCompoundSA();
        if (move.compound?.replaceRemainingStages === true) {
          executionTraceEntries.push({
            kind: 'operationCompoundStagesReplaced',
            actionId: action.id,
            profileId: executionProfile.profileId,
            insertAfterStage: insertAfter,
            totalStages: executionProfile.resolutionStages.length,
            skippedStageCount: executionProfile.resolutionStages.length - insertAfter - 1,
          });
          break;
        }
      }
    }
  }

  if (move.compound?.timing === 'after') {
    applyCompoundSA();
  }

  const lastingActivation = executeEventMove(
    def,
    effectState,
    effectRng,
    move,
    shared.executionPolicy,
    shared.evalRuntimeResources.collector,
    String(action.id),
    tracker,
  );
  effectState = lastingActivation.state;
  effectRng = lastingActivation.rng;
  if (lastingActivation.emittedEvents.length > 0) {
    emittedEvents.push(...lastingActivation.emittedEvents);
  }

  if (originatingPhaseDef?.actionDefaults?.afterEffects !== undefined &&
      originatingPhaseDef.actionDefaults.afterEffects.length > 0) {
    const afterResult = applyEffects(
      originatingPhaseDef.actionDefaults.afterEffects,
      createExecutionEffectContext({
        ...effectCtx,
        state: effectState,
        rng: effectRng,
        traceContext: {
          eventContext: 'phaseAfterEffect',
          actionId: String(action.id),
          effectPathRoot: `action:${String(action.id)}.afterEffects`,
        },
        effectPath: '',
        ...(tracker === undefined ? {} : { tracker }),
      }),
    );
    effectState = afterResult.state;
    effectRng = afterResult.rng;
    if (afterResult.emittedEvents !== undefined) {
      emittedEvents.push(...afterResult.emittedEvents);
    }
  }

  perfEnd(profiler, 'actionEffects', t0_actionEffects);

  const stateWithUsage = incrementActionUsage(effectState, action.id);
  const maxDepth = def.metadata.maxTriggerDepth ?? DEFAULT_MAX_TRIGGER_DEPTH;
  let triggerState = stateWithUsage;
  let triggerRng = effectRng;
  let triggerLog = [] as ApplyMoveResult['triggerFirings'];

  const t0_triggers = perfStart(profiler);
  for (const emittedEvent of emittedEvents) {
    const emittedEventResult = dispatchTriggers({
      def,
      state: triggerState,
      rng: triggerRng,
      event: emittedEvent,
      depth: 0,
      maxDepth,
      triggerLog,
      adjacencyGraph: shared.adjacencyGraph,
      runtimeTableIndex: shared.runtimeTableIndex,
      ...(cachedRuntime === undefined ? {} : { cachedRuntime }),
      effectPathRoot: `action:${String(action.id)}.emittedEvent(${emittedEvent.type})`,
      evalRuntimeResources: shared.evalRuntimeResources,
      ...(tracker === undefined ? {} : { tracker }),
      ...(shared.executionPolicy === undefined ? {} : { policy: shared.executionPolicy }),
    });
    triggerState = emittedEventResult.state;
    triggerRng = emittedEventResult.rng;
    triggerLog = emittedEventResult.triggerLog;
  }

  const triggerResult = dispatchTriggers({
    def,
    state: triggerState,
    rng: triggerRng,
    event: { type: 'actionResolved', action: move.actionId },
    depth: 0,
    maxDepth,
    triggerLog,
    adjacencyGraph: shared.adjacencyGraph,
    runtimeTableIndex: shared.runtimeTableIndex,
    ...(cachedRuntime === undefined ? {} : { cachedRuntime }),
    effectPathRoot: `action:${String(action.id)}.actionResolved`,
    evalRuntimeResources: shared.evalRuntimeResources,
    ...(tracker === undefined ? {} : { tracker }),
    ...(shared.executionPolicy === undefined ? {} : { policy: shared.executionPolicy }),
  });
  perfEnd(profiler, 'dispatchTriggers', t0_triggers);

  const stateWithRng = tracker === undefined || triggerResult.state.rng === triggerResult.rng.state
    ? (triggerResult.state.rng === triggerResult.rng.state
      ? triggerResult.state
      : {
        ...triggerResult.state,
        rng: triggerResult.rng.state,
      })
    : (() => {
      const mutableState = triggerResult.state as MutableGameState;
      mutableState.rng = triggerResult.rng.state;
      return mutableState;
    })();

  return {
    stateWithRng,
    triggerFirings: [...executionTraceEntries, ...triggerResult.triggerLog],
    sideEffectManifest: lastingActivation.sideEffectManifest,
  };
};

const applyReleasedDeferredEventEffects = (
  def: GameDef,
  state: GameState,
  releasedDeferredEventEffects: readonly TurnFlowReleasedDeferredEventEffect[],
  shared: SharedMoveExecutionContext,
  tracker?: DraftTracker,
): MoveActionExecutionResult => {
  if (releasedDeferredEventEffects.length === 0) {
    return { stateWithRng: state, triggerFirings: [] };
  }
  let nextState = state;
  let nextRng: Rng = { state: state.rng };
  let triggerLog = [] as readonly TriggerLogEntry[];
  const maxDepth = def.metadata.maxTriggerDepth ?? DEFAULT_MAX_TRIGGER_DEPTH;
  for (const deferredEventEffect of releasedDeferredEventEffects) {
    const actorPlayer = deferredEventEffect.actorPlayer;
    if (!Number.isSafeInteger(actorPlayer) || actorPlayer < 0 || actorPlayer >= nextState.playerCount) {
      throw kernelRuntimeError(
        'RUNTIME_CONTRACT_INVALID',
        `Deferred event effect actorPlayer out of range: actorPlayer=${String(actorPlayer)} playerCount=${nextState.playerCount} actionId=${deferredEventEffect.actionId}`,
      );
    }
    const effectPlayer = asPlayerId(actorPlayer);
    const effectResult = applyEffects(deferredEventEffect.effects, createExecutionEffectContext({
      def,
      adjacencyGraph: shared.adjacencyGraph,
      runtimeTableIndex: shared.runtimeTableIndex,
      state: nextState,
      rng: nextRng,
      activePlayer: effectPlayer,
      actorPlayer: effectPlayer,
      bindings: { ...deferredEventEffect.moveParams },
      moveParams: deferredEventEffect.moveParams,
      resources: shared.evalRuntimeResources,
      ...(shared.cachedRuntime === undefined ? {} : { cachedRuntime: shared.cachedRuntime }),
      traceContext: {
        eventContext: 'actionEffect',
        actionId: deferredEventEffect.actionId,
        effectPathRoot: `action:${deferredEventEffect.actionId}.deferredEventEffects`,
      },
      effectPath: '',
      ...(tracker === undefined ? {} : { tracker }),
      ...(shared.executionPolicy?.verifyCompiledEffects === undefined
        ? {}
        : { verifyCompiledEffects: shared.executionPolicy.verifyCompiledEffects }),
      ...(shared.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: shared.phaseTransitionBudget }),
    }));
    nextState = effectResult.state;
    nextRng = effectResult.rng;
    for (const emittedEvent of effectResult.emittedEvents ?? []) {
      const emittedEventResult = dispatchTriggers({
        def,
        state: nextState,
        rng: nextRng,
        event: emittedEvent,
        depth: 0,
        maxDepth,
        triggerLog,
        adjacencyGraph: shared.adjacencyGraph,
        runtimeTableIndex: shared.runtimeTableIndex,
        ...(shared.cachedRuntime === undefined ? {} : { cachedRuntime: shared.cachedRuntime }),
        effectPathRoot: `action:${deferredEventEffect.actionId}.deferredEvent(${emittedEvent.type})`,
        evalRuntimeResources: shared.evalRuntimeResources,
        ...(tracker === undefined ? {} : { tracker }),
        ...(shared.executionPolicy === undefined ? {} : { policy: shared.executionPolicy }),
      });
      nextState = emittedEventResult.state;
      nextRng = emittedEventResult.rng;
      triggerLog = emittedEventResult.triggerLog;
    }
    triggerLog = [
      ...triggerLog,
      createDeferredLifecycleTraceEntry('executed', deferredEventEffect),
    ];
  }
  const stateWithRng = tracker === undefined || nextState.rng === nextRng.state
    ? (nextState.rng === nextRng.state
      ? nextState
      : {
        ...nextState,
        rng: nextRng.state,
      })
    : (() => {
      const mutableState = nextState as MutableGameState;
      mutableState.rng = nextRng.state;
      return mutableState;
    })();

  return {
    stateWithRng,
    triggerFirings: triggerLog,
  };
};

const applyMoveCore = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: ExecutionOptions,
  coreOptions?: ApplyMoveCoreOptions,
  cachedRuntime?: GameDefRuntime,
): ApplyMoveResult => {
  const mutableState = createMutableState(state);
  const tracker = createDraftTracker();
  const profiler: PerfProfiler | undefined = options?.profiler;
  validateTurnFlowRuntimeStateInvariants(state);
  const adjacencyGraph = cachedRuntime?.adjacencyGraph ?? buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = cachedRuntime?.runtimeTableIndex ?? buildRuntimeTableIndex(def);
  const runtime = coreOptions?.executionRuntime ?? createMoveExecutionRuntime(options, coreOptions?.phaseTransitionBudget);
  if (coreOptions?.executionRuntime !== undefined) {
    validatedMaxPhaseTransitionsPerMove(options);
  }
  const evalRuntimeResources = createEvalRuntimeResources({
    collector: runtime.collector,
  });
  const shared: SharedMoveExecutionContext = {
    adjacencyGraph,
    runtimeTableIndex,
    evalRuntimeResources,
    ...(cachedRuntime === undefined ? {} : { cachedRuntime }),
    ...(runtime.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: runtime.phaseTransitionBudget }),
    ...(runtime.executionPolicy === undefined ? {} : { executionPolicy: runtime.executionPolicy }),
  };
  const seatResolution = createSeatResolutionContext(def, state.playerCount);

  const t0_exec = perfStart(profiler);
  const executed = executeMoveAction(def, mutableState, move, seatResolution, options, coreOptions, shared, tracker, cachedRuntime);
  perfEnd(profiler, 'executeMoveAction', t0_exec);

  const t0_freeOp = perfStart(profiler);
  // CONTRACT: Pair with legal-moves.ts `isFreeOperationCandidateAdmitted`.
  // Required grants stay visible during enumeration; outcome policy is enforced here.
  validateFreeOperationOutcomePolicy(def, state, executed.stateWithRng, move, seatResolution);
  perfEnd(profiler, 'validateFreeOperationOutcomePolicy', t0_freeOp);

  const t0_turnFlow = perfStart(profiler);
  const turnFlowResult = move.freeOperation === true
    ? (() => {
      const consumed = consumeAuthorizedFreeOperationGrant(def, state, executed.stateWithRng, move, seatResolution);
      if (consumed.consumedGrant?.postResolutionTurnFlow !== 'resumeCardFlow') {
        return {
          state: consumed.state,
          traceEntries: consumed.traceEntries,
          boundaryDurations: undefined,
          releasedDeferredEventEffects: consumed.releasedDeferredEventEffects,
        };
      }
      const progressed = applyTurnFlowEligibilityAfterMove(def, consumed.state, move, undefined, {
        originatingPhase: state.currentPhase,
        tracker,
      });
      return {
        state: progressed.state,
        traceEntries: [...consumed.traceEntries, ...progressed.traceEntries],
        boundaryDurations: progressed.boundaryDurations,
        releasedDeferredEventEffects: [
          ...consumed.releasedDeferredEventEffects,
          ...(progressed.releasedDeferredEventEffects ?? []),
        ],
      };
    })()
    : applyTurnFlowEligibilityAfterMove(def, executed.stateWithRng, move, executed.sideEffectManifest, {
      originatingPhase: state.currentPhase,
      tracker,
    });
  perfEnd(profiler, 'applyTurnFlowEligibility', t0_turnFlow);

  const t0_deferred = perfStart(profiler);
  const deferredExecution = applyReleasedDeferredEventEffects(
    def,
    turnFlowResult.state,
    turnFlowResult.releasedDeferredEventEffects ?? [],
    shared,
    tracker,
  );
  perfEnd(profiler, 'applyDeferredEventEffects', t0_deferred);

  const t0_boundary = perfStart(profiler);
  const boundaryExpiryResult = applyBoundaryExpiry(
    def,
    deferredExecution.stateWithRng,
    turnFlowResult.boundaryDurations,
    undefined,
    shared.executionPolicy,
    shared.evalRuntimeResources,
    'boundaryExpiry',
    shared.cachedRuntime,
    tracker,
  );
  perfEnd(profiler, 'applyBoundaryExpiry', t0_boundary);

  const lifecycleAndAdvanceLog: TriggerLogEntry[] = [];
  const shouldAdvanceToDecisionPoint =
    coreOptions?.skipAdvanceToDecisionPoint !== true
    && options?.advanceToDecisionPoint !== false;

  const t0_advance = perfStart(profiler);
  const progressedState = shouldAdvanceToDecisionPoint
    ? advanceToDecisionPoint(
      def,
      boundaryExpiryResult.state,
      lifecycleAndAdvanceLog,
      runtime.executionPolicy,
      tracker,
      shared.evalRuntimeResources,
      cachedRuntime,
      profiler,
    )
    : boundaryExpiryResult.state;
  perfEnd(profiler, 'advanceToDecisionPoint', t0_advance);

  // Reconcile _runningHash by diffing the original input state against the
  // final progressed state. This single call replaces all intermediate hash
  // patches and is correct by construction — it covers every hashed feature
  // category. When no zobrist table is available, fall back to full recompute.
  const t0_hash = perfStart(profiler);
  const reconciledHash = cachedRuntime?.zobristTable
    ? reconcileRunningHash(cachedRuntime.zobristTable, state, progressedState)
    : computeFullHash(createZobristTable(def), progressedState);
  const stateWithHash = progressedState as MutableGameState;
  stateWithHash.stateHash = reconciledHash;
  stateWithHash._runningHash = reconciledHash;
  perfEnd(profiler, 'computeFullHash', t0_hash);

  if (shouldVerifyHash(options, stateWithHash.turnCount)) {
    const verifyTable = cachedRuntime?.zobristTable ?? createZobristTable(def);
    const fullHash = computeFullHash(verifyTable, stateWithHash);
    if (fullHash !== stateWithHash.stateHash) {
      throw kernelRuntimeError('HASH_DRIFT', 'Incremental Zobrist hash drift detected', {
        expected: fullHash,
        actual: stateWithHash.stateHash,
        turnCount: stateWithHash.turnCount,
        currentPhase: stateWithHash.currentPhase as string,
      });
    }
  }

  return {
    state: freezeState(stateWithHash),
    triggerFirings: [
      ...executed.triggerFirings,
      ...turnFlowResult.traceEntries,
      ...deferredExecution.triggerFirings,
      ...boundaryExpiryResult.traceEntries,
      ...lifecycleAndAdvanceLog,
    ],
    warnings: runtime.collector.warnings,
    ...(runtime.collector.trace !== null ? { effectTrace: runtime.collector.trace } : {}),
    ...(runtime.collector.conditionTrace !== null ? { conditionTrace: runtime.collector.conditionTrace } : {}),
    ...(runtime.collector.decisionTrace !== null ? { decisionTrace: runtime.collector.decisionTrace } : {}),
    ...(runtime.collector.selectorTrace !== null ? { selectorTrace: runtime.collector.selectorTrace } : {}),
  };
};

const createSimultaneousSubmittedMap = (playerCount: number): Readonly<Record<number, boolean>> =>
  Object.fromEntries(Array.from({ length: playerCount }, (_unused, index) => [index, false]));

const toSimultaneousSubmission = (move: Move): SimultaneousMoveSubmission => ({
  actionId: String(move.actionId),
  params: move.params,
  ...(move.freeOperation === undefined ? {} : { freeOperation: move.freeOperation }),
  ...(move.actionClass === undefined ? {} : { actionClass: move.actionClass }),
});

const toMoveFromSubmission = (
  submission: ReturnType<typeof toSimultaneousSubmission>,
): Move => ({
  actionId: submission.actionId as Move['actionId'],
  params: submission.params,
  ...(submission.freeOperation === undefined ? {} : { freeOperation: submission.freeOperation }),
  ...(submission.actionClass === undefined ? {} : { actionClass: submission.actionClass }),
});

const simultaneousSubmissionTrace = (
  player: number,
  move: ReturnType<typeof toSimultaneousSubmission>,
  submittedBefore: Readonly<Record<number, boolean>>,
  submittedAfter: Readonly<Record<number, boolean>>,
): TriggerLogEntry => ({
  kind: 'simultaneousSubmission',
  player,
  move,
  submittedBefore,
  submittedAfter,
});

const nextUnsubmittedPlayer = (
  currentPlayer: number,
  submitted: Readonly<Record<number, boolean>>,
  playerCount: number,
): number | null => {
  for (let offset = 1; offset <= playerCount; offset += 1) {
    const candidate = (currentPlayer + offset) % playerCount;
    if (submitted[candidate] !== true) {
      return candidate;
    }
  }
  return null;
};

const applySimultaneousSubmission = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: ExecutionOptions,
  cachedRuntime?: GameDefRuntime,
): ApplyMoveResult => {
  validatedMaxPhaseTransitionsPerMove(options);
  if (move.compound !== undefined) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.SIMULTANEOUS_SUBMISSION_COMPOUND_UNSUPPORTED);
  }
  if (state.turnOrderState.type !== 'simultaneous') {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.SIMULTANEOUS_RUNTIME_STATE_REQUIRED);
  }

  validateMove(
    def,
    state,
    move,
    createSeatResolutionContext(def, state.playerCount),
    createEvalRuntimeResources(),
    cachedRuntime,
  );

  const currentPlayer = Number(state.activePlayer);
  const submittedBefore = state.turnOrderState.submitted;
  const submittedMove = toSimultaneousSubmission(move);
  const submitted = {
    ...submittedBefore,
    [currentPlayer]: true,
  };
  const pending = {
    ...state.turnOrderState.pending,
    [currentPlayer]: submittedMove,
  };
  const table = cachedRuntime?.zobristTable ?? createZobristTable(def);
  const hasRemainingPlayers = Object.values(submitted).some((value) => value === false);

  if (hasRemainingPlayers) {
    const nextPlayer = nextUnsubmittedPlayer(currentPlayer, submitted, state.playerCount);
    const waitingState: GameState = {
      ...state,
      activePlayer: nextPlayer === null ? state.activePlayer : asPlayerId(nextPlayer),
      turnOrderState: {
        type: 'simultaneous',
        submitted,
        pending,
      },
    };

    return {
      state: {
        ...waitingState,
        stateHash: computeFullHash(table, waitingState),
      },
      triggerFirings: [simultaneousSubmissionTrace(currentPlayer, submittedMove, submittedBefore, submitted)],
      warnings: [],
    };
  }

  const orderedPlayers = Array.from({ length: state.playerCount }, (_unused, index) => index);
  let committedState: GameState = {
    ...state,
    turnOrderState: {
      type: 'simultaneous',
      submitted,
      pending,
    },
  };
  const triggerFirings: TriggerLogEntry[] = [
    simultaneousSubmissionTrace(currentPlayer, submittedMove, submittedBefore, submitted),
    {
      kind: 'simultaneousCommit',
      playersInOrder: orderedPlayers.map(String),
      pendingCount: Object.keys(pending).length,
    },
  ];
  const commitRuntime = createMoveExecutionRuntime(options);

  for (const player of orderedPlayers) {
    const submission = pending[player];
    if (submission === undefined) {
      continue;
    }
    const applied = applyMoveCore(
      def,
      {
        ...committedState,
        activePlayer: asPlayerId(player),
      },
      toMoveFromSubmission(submission),
      options,
      {
        skipValidation: true,
        skipAdvanceToDecisionPoint: true,
        executionRuntime: commitRuntime,
      },
      cachedRuntime,
    );
    committedState = applied.state;
    triggerFirings.push(...applied.triggerFirings);
  }

  const resetState: GameState = {
    ...committedState,
    activePlayer: asPlayerId(0),
    turnOrderState: {
      type: 'simultaneous',
      submitted: createSimultaneousSubmittedMap(committedState.playerCount),
      pending: {},
    },
  };
  const lifecycleAndAdvanceLog: TriggerLogEntry[] = [];
  const progressedState = options?.advanceToDecisionPoint === false
    ? resetState
    : advanceToDecisionPoint(
      def,
      resetState,
      lifecycleAndAdvanceLog,
      commitRuntime.executionPolicy,
      undefined,
      createEvalRuntimeResources({ collector: commitRuntime.collector }),
      cachedRuntime,
    );
  const finalState = {
    ...progressedState,
    stateHash: computeFullHash(table, progressedState),
  };

  return {
    state: finalState,
    triggerFirings: [...triggerFirings, ...lifecycleAndAdvanceLog],
    warnings: commitRuntime.collector.warnings,
    ...(commitRuntime.collector.trace === null ? {} : { effectTrace: commitRuntime.collector.trace }),
    ...(commitRuntime.collector.conditionTrace === null ? {} : { conditionTrace: commitRuntime.collector.conditionTrace }),
    ...(commitRuntime.collector.decisionTrace === null ? {} : { decisionTrace: commitRuntime.collector.decisionTrace }),
    ...(commitRuntime.collector.selectorTrace === null ? {} : { selectorTrace: commitRuntime.collector.selectorTrace }),
  };
};

export const applyMove = (def: GameDef, state: GameState, move: Move, options?: ExecutionOptions, runtime?: GameDefRuntime): ApplyMoveResult => {
  if (def.turnOrder?.type === 'simultaneous') {
    return applySimultaneousSubmission(def, state, move, options, runtime);
  }
  return applyMoveCore(def, state, move, options, undefined, runtime);
};

const assertTrustedExecutableMove = (
  trustedMove: TrustedExecutableMove,
  state: GameState,
): void => {
  if (typeof trustedMove.sourceStateHash !== 'bigint') {
    throw new Error('Trusted move is missing a bigint sourceStateHash.');
  }
  if (trustedMove.sourceStateHash !== state.stateHash) {
    throw new Error('Trusted move sourceStateHash does not match the current state.');
  }
  if (trustedMove.move === undefined || typeof trustedMove.move !== 'object' || trustedMove.move === null) {
    throw new Error('Trusted move is missing its executable move payload.');
  }
};

export const applyTrustedMove = (
  def: GameDef,
  state: GameState,
  trustedMove: TrustedExecutableMove,
  options?: ExecutionOptions,
  runtime?: GameDefRuntime,
): ApplyMoveResult => {
  assertTrustedExecutableMove(trustedMove, state);
  if (def.turnOrder?.type === 'simultaneous') {
    return applySimultaneousSubmission(def, state, trustedMove.move, options, runtime);
  }
  return applyMoveCore(
    def,
    state,
    trustedMove.move,
    options,
    { skipValidation: true },
    runtime,
  );
};

export const probeMoveLegality = (
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
): MoveLegalityProbeResult => {
  try {
    validateMove(
      def,
      state,
      move,
      createSeatResolutionContext(def, state.playerCount),
      createEvalRuntimeResources(),
      runtime,
    );
    return { legal: true };
  } catch (error) {
    if (isKernelRuntimeError(error)) {
      if (error.code === 'ILLEGAL_MOVE') {
        const illegalError = error as KernelRuntimeError<'ILLEGAL_MOVE'>;
        return {
          legal: false,
          code: illegalError.code,
          context: illegalError.context as IllegalMoveContext,
          error: illegalError,
        };
      }
      const nonIllegalError = error as KernelRuntimeError<Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>>;
      return {
        legal: false,
        code: nonIllegalError.code,
        error: nonIllegalError,
        ...(nonIllegalError.context === undefined ? {} : { context: nonIllegalError.context }),
      };
    }
    throw error;
  }
};

export const probeMoveViability = (
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
  discoveryCache?: DiscoveryCache,
): MoveViabilityProbeResult => {
  try {
    const seatResolution = createSeatResolutionContext(def, state.playerCount);
    const evalRuntimeResources = createEvalRuntimeResources();
    const classMismatch = resolveTurnFlowActionClassMismatch(def, move);
    if (classMismatch !== null) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH, {
        mappedActionClass: classMismatch.mapped,
        submittedActionClass: classMismatch.submitted,
      });
    }
    const freeOperationAnalysis = resolveMoveFreeOperationAnalysis(def, state, move, seatResolution);
    const deniedFreeOperationCause = freeOperationAnalysis === null
      ? null
      : toFreeOperationDeniedCauseForLegality(freeOperationAnalysis.denial.cause);
    if (move.freeOperation === true && freeOperationAnalysis !== null && deniedFreeOperationCause !== null) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED, {
        freeOperationDenial: freeOperationAnalysis.denial,
      });
    }
    if (
      hasActiveSeatRequiredPendingFreeOperationGrant(def, state, seatResolution)
      && !isMoveAllowedByRequiredPendingFreeOperationGrant(def, state, move, seatResolution)
    ) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE, {
        detail: 'active seat has unresolved required free-operation grants',
      });
    }

    const adjacencyGraph = runtime?.adjacencyGraph ?? buildAdjacencyGraph(def.zones);
    const runtimeTableIndex = runtime?.runtimeTableIndex ?? buildRuntimeTableIndex(def);
    const preflight = resolveMovePreflightContext(
      def,
      state,
      move,
      seatResolution,
      adjacencyGraph,
      runtimeTableIndex,
      evalRuntimeResources,
      'validation',
      runtime,
      freeOperationAnalysis,
    );

    if (preflight.action.pre !== null && !evaluateConditionWithCache(preflight.action.pre, preflight.evalCtx)) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE);
    }
    if (preflight.actionPipeline === undefined) {
      for (const param of preflight.action.params) {
        if (!(param.name in move.params)) {
          continue;
        }
        if (!isDeclaredActionParamValueInDomain(param, move.params[param.name], preflight.evalCtx)) {
          throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION);
        }
      }
    }
    validateTurnFlowWindowAccess(def, state, move, preflight.actionPipeline, seatResolution);

    const sequence = resolveMoveDecisionSequence(
      def,
      state,
      move,
      {
        choose: () => undefined,
        ...(discoveryCache === undefined ? {} : { discoveryCache }),
      },
      runtime,
    );
    if (sequence.illegal !== undefined) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE, {
        detail: sequence.illegal.reason,
      });
    }
    if (sequence.nextDecision !== undefined && sequence.nextDecision.options.length === 0) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE, {
        detail: `decision ${sequence.nextDecision.name} has no legal options`,
      });
    }
    if (
      sequence.nextDecisionSet !== undefined
      && sequence.nextDecisionSet.length > 0
      && sequence.nextDecisionSet.every((request) => request.options.length === 0)
    ) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE, {
        detail: 'all pending decision alternatives have no legal options',
      });
    }
    if (sequence.complete) {
      const strongestOutcomeGrant = resolveStrongestRequiredFreeOperationOutcomeGrant(
        def,
        state,
        sequence.move,
        seatResolution,
        TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_MATCH_EVALUATION,
      );
      if (
        strongestOutcomeGrant !== null
        && !doesCompletedProbeMoveChangeGameplayState(def, state, sequence.move, seatResolution)
      ) {
        throw illegalMoveError(sequence.move, ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED, {
          grantId: strongestOutcomeGrant.grantId,
          outcomePolicy: 'mustChangeGameplayState',
        });
      }
      return {
        viable: true,
        complete: true,
        move: sequence.move,
        warnings: sequence.warnings,
        code: undefined,
        context: undefined,
        error: undefined,
        nextDecision: undefined,
        nextDecisionSet: undefined,
        stochasticDecision: undefined,
      };
    }
    return {
      viable: true,
      complete: false,
      move: sequence.move,
      warnings: sequence.warnings,
      code: undefined,
      context: undefined,
      error: undefined,
      nextDecision: sequence.nextDecision,
      nextDecisionSet: sequence.nextDecisionSet,
      stochasticDecision: sequence.stochasticDecision,
    };
  } catch (error) {
    if (isKernelRuntimeError(error)) {
      if (error.code === 'ILLEGAL_MOVE') {
        const illegalError = error as KernelRuntimeError<'ILLEGAL_MOVE'>;
        return {
          viable: false,
          complete: undefined,
          move: undefined,
          warnings: undefined,
          code: illegalError.code,
          context: illegalError.context as IllegalMoveContext,
          error: illegalError,
          nextDecision: undefined,
          nextDecisionSet: undefined,
          stochasticDecision: undefined,
        };
      }
      const nonIllegalError = error as KernelRuntimeError<Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>>;
      return {
        viable: false,
        complete: undefined,
        move: undefined,
        warnings: undefined,
        code: nonIllegalError.code,
        context: nonIllegalError.context,
        error: nonIllegalError,
        nextDecision: undefined,
        nextDecisionSet: undefined,
        stochasticDecision: undefined,
      };
    }
    throw error;
  }
};
