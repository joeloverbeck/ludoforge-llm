import { incrementActionUsage } from './action-usage.js';
import { perfStart, perfEnd, type PerfProfiler } from './perf-profiler.js';
import { deepEqual } from './deep-equal.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { applyBoundaryExpiry } from './boundary-expiry.js';
import { isEffectRuntimeReason } from './effect-error.js';
import { applyEffects } from './effects.js';
import {
  executeEventMove,
  shouldDeferIncompleteDecisionValidationForMove,
} from './event-execution.js';
import { createCollector } from './execution-collector.js';
import { resolveActionPipelineDispatch, toExecutionPipeline } from './apply-move-pipeline.js';
import { toApplyMoveIllegalReason } from './legality-outcome.js';
import {
  decideApplyMovePipelineViability,
  evaluatePipelinePredicateStatus,
  evaluateStagePredicateStatus,
} from './pipeline-viability-policy.js';
import { resolveActionExecutor } from './action-executor.js';
import { evalCondition } from './eval-condition.js';
import { isDeclaredActionParamValueInDomain } from './declared-action-param-domain.js';
import { createEvalContext, createEvalRuntimeResources, type ReadContext, type EvalRuntimeResources } from './eval-context.js';
import {
  buildMoveRuntimeBindings,
  deriveDecisionBindingsFromMoveParams,
  resolvePipelineDecisionBindingsForMove,
} from './move-runtime-bindings.js';
import { EFFECT_RUNTIME_REASONS, ILLEGAL_MOVE_REASONS } from './runtime-reasons.js';
import { advanceToDecisionPoint } from './phase-advance.js';
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
  applyTurnFlowEligibilityAfterMove,
  consumeTurnFlowFreeOperationGrant,
  hasActiveSeatRequiredPendingFreeOperationGrant,
  isMoveAllowedByRequiredPendingFreeOperationGrant,
} from './turn-flow-eligibility.js';
import { resolveAuthorizedPendingFreeOperationGrants } from './free-operation-grant-authorization.js';
import { resolveFreeOperationDiscoveryAnalysis } from './free-operation-discovery-analysis.js';
import { resolveTurnFlowActionClassMismatch } from './turn-flow-action-class.js';
import { toFreeOperationDeniedCauseForLegality } from './free-operation-legality-policy.js';
import { applyTurnFlowWindowFilters, isMoveAllowedByTurnFlowOptionMatrix } from './legal-moves-turn-order.js';
import { isTurnFlowErrorCode } from './turn-flow-error.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import { selectorInvalidSpecError } from './selector-runtime-contract.js';
import { findPhaseDef } from './phase-lookup.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { toMoveExecutionPolicy } from './execution-policy.js';
import { createSeatResolutionContext } from './identity.js';
import { validateTurnFlowRuntimeStateInvariants } from './turn-flow-runtime-invariants.js';
import { requireCardDrivenActiveSeat } from './turn-flow-runtime-invariants.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS } from './turn-flow-active-seat-invariant-surfaces.js';
import { createDeferredLifecycleTraceEntry } from './turn-flow-deferred-lifecycle-trace.js';
import { createExecutionEffectContext, type PhaseTransitionBudget } from './effect-context.js';
import { buildFreeOperationPreflightOverlay } from './free-operation-preflight-overlay.js';
import { materialGameplayStateProjection } from './material-gameplay-state.js';
import type { SimultaneousMoveSubmission } from './types-turn-flow.js';
import type {
  ActionDef,
  ActionPipelineDef,
  ApplyMoveResult,
  ChoicePendingRequest,
  ChoiceStochasticPendingRequest,
  ExecutionOptions,
  GameDef,
  GameState,
  Move,
  MoveParamScalar,
  MoveParamValue,
  Rng,
  RuntimeWarning,
  TurnFlowDeferredEventEffectPayload,
  TurnFlowReleasedDeferredEventEffect,
  TriggerLogEntry,
  TriggerEvent,
} from './types.js';
import { asPlayerId } from './branded.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { computeFullHash, createZobristTable } from './zobrist.js';
import { resolveMoveDecisionSequence } from './move-decision-sequence.js';

const DEFAULT_MAX_TRIGGER_DEPTH = 8;

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

const validateFreeOperationOutcomePolicy = (
  def: GameDef,
  beforeState: GameState,
  afterActionState: GameState,
  move: Move,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
): void => {
  if (move.freeOperation !== true || beforeState.turnOrderState.type !== 'cardDriven') {
    return;
  }
  const activeSeat = requireCardDrivenActiveSeat(
    def,
    beforeState,
    TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_CONSUMPTION,
    seatResolution,
  );
  const pending = beforeState.turnOrderState.runtime.pendingFreeOperationGrants ?? [];
  const authorized = resolveAuthorizedPendingFreeOperationGrants(def, beforeState, pending, activeSeat, move);
  if (authorized.strongestOutcomeGrant === null) {
    return;
  }
  if (deepEqual(
    materialGameplayStateProjection(def, beforeState),
    materialGameplayStateProjection(def, afterActionState),
  )) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED, {
      grantId: authorized.strongestOutcomeGrant.grantId,
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

export type MoveViabilityProbeResult =
  | Readonly<{
      readonly viable: true;
      readonly complete: true;
      readonly move: Move;
      readonly warnings: readonly RuntimeWarning[];
    }>
  | Readonly<{
      readonly viable: true;
      readonly complete: false;
      readonly move: Move;
      readonly warnings: readonly RuntimeWarning[];
      readonly nextDecision?: ChoicePendingRequest;
      readonly nextDecisionSet?: readonly ChoicePendingRequest[];
      readonly stochasticDecision?: ChoiceStochasticPendingRequest;
    }>
  | Readonly<{
      readonly viable: false;
      readonly code: 'ILLEGAL_MOVE';
      readonly context: IllegalMoveContext;
      readonly error: KernelRuntimeError<'ILLEGAL_MOVE'>;
    }>
  | Readonly<{
      readonly viable: false;
      readonly code: Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>;
      readonly context?: KernelRuntimeErrorContext<Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>>;
      readonly error: KernelRuntimeError<Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>>;
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
  if (action.pre !== null && !evalCondition(action.pre, preflight.evalCtx)) {
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
}

interface MoveActionExecutionResult {
  readonly stateWithRng: GameState;
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly deferredEventEffect?: TurnFlowDeferredEventEffectPayload;
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
  const executionPolicy = toMoveExecutionPolicy(phaseTransitionBudget);
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
      effectPathRoot: `action:${String(action.id)}.emittedEvent(${emittedEvent.type})`,
      evalRuntimeResources: shared.evalRuntimeResources,
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
    effectPathRoot: `action:${String(action.id)}.actionResolved`,
    evalRuntimeResources: shared.evalRuntimeResources,
    ...(shared.executionPolicy === undefined ? {} : { policy: shared.executionPolicy }),
  });
  perfEnd(profiler, 'dispatchTriggers', t0_triggers);

  return {
    stateWithRng: {
      ...triggerResult.state,
      rng: triggerResult.rng.state,
    },
    triggerFirings: [...executionTraceEntries, ...triggerResult.triggerLog],
    ...(lastingActivation.deferredEventEffect === undefined
      ? {}
      : { deferredEventEffect: lastingActivation.deferredEventEffect }),
  };
};

const applyReleasedDeferredEventEffects = (
  def: GameDef,
  state: GameState,
  releasedDeferredEventEffects: readonly TurnFlowReleasedDeferredEventEffect[],
  shared: SharedMoveExecutionContext,
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
      traceContext: {
        eventContext: 'actionEffect',
        actionId: deferredEventEffect.actionId,
        effectPathRoot: `action:${deferredEventEffect.actionId}.deferredEventEffects`,
      },
      effectPath: '',
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
        effectPathRoot: `action:${deferredEventEffect.actionId}.deferredEvent(${emittedEvent.type})`,
        evalRuntimeResources: shared.evalRuntimeResources,
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
  return {
    stateWithRng: {
      ...nextState,
      rng: nextRng.state,
    },
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
    ...(runtime.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: runtime.phaseTransitionBudget }),
    ...(runtime.executionPolicy === undefined ? {} : { executionPolicy: runtime.executionPolicy }),
  };
  const seatResolution = createSeatResolutionContext(def, state.playerCount);

  const t0_exec = perfStart(profiler);
  const executed = executeMoveAction(def, state, move, seatResolution, options, coreOptions, shared, cachedRuntime);
  perfEnd(profiler, 'executeMoveAction', t0_exec);

  const t0_freeOp = perfStart(profiler);
  validateFreeOperationOutcomePolicy(def, state, executed.stateWithRng, move, seatResolution);
  perfEnd(profiler, 'validateFreeOperationOutcomePolicy', t0_freeOp);

  const t0_turnFlow = perfStart(profiler);
  const turnFlowResult = move.freeOperation === true
    ? (() => {
      const consumed = consumeTurnFlowFreeOperationGrant(def, state, executed.stateWithRng, move, seatResolution);
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
    : applyTurnFlowEligibilityAfterMove(def, executed.stateWithRng, move, executed.deferredEventEffect, {
      originatingPhase: state.currentPhase,
    });
  perfEnd(profiler, 'applyTurnFlowEligibility', t0_turnFlow);

  const t0_deferred = perfStart(profiler);
  const deferredExecution = applyReleasedDeferredEventEffects(
    def,
    turnFlowResult.state,
    turnFlowResult.releasedDeferredEventEffects ?? [],
    shared,
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
      shared.evalRuntimeResources,
      cachedRuntime,
      profiler,
    )
    : boundaryExpiryResult.state;
  perfEnd(profiler, 'advanceToDecisionPoint', t0_advance);

  const t0_hash = perfStart(profiler);
  const stateWithHash = {
    ...progressedState,
    stateHash: computeFullHash(cachedRuntime?.zobristTable ?? createZobristTable(def), progressedState),
  };
  perfEnd(profiler, 'computeFullHash', t0_hash);

  return {
    state: stateWithHash,
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

    if (preflight.action.pre !== null && !evalCondition(preflight.action.pre, preflight.evalCtx)) {
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

    const sequence = resolveMoveDecisionSequence(def, state, move, { choose: () => undefined }, runtime);
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
      return {
        viable: true,
        complete: true,
        move: sequence.move,
        warnings: sequence.warnings,
      };
    }
    return {
      viable: true,
      complete: false,
      move: sequence.move,
      warnings: sequence.warnings,
      ...(sequence.nextDecision === undefined ? {} : { nextDecision: sequence.nextDecision }),
      ...(sequence.nextDecisionSet === undefined ? {} : { nextDecisionSet: sequence.nextDecisionSet }),
      ...(sequence.stochasticDecision === undefined ? {} : { stochasticDecision: sequence.stochasticDecision }),
    };
  } catch (error) {
    if (isKernelRuntimeError(error)) {
      if (error.code === 'ILLEGAL_MOVE') {
        const illegalError = error as KernelRuntimeError<'ILLEGAL_MOVE'>;
        return {
          viable: false,
          code: illegalError.code,
          context: illegalError.context as IllegalMoveContext,
          error: illegalError,
        };
      }
      const nonIllegalError = error as KernelRuntimeError<Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>>;
      return {
        viable: false,
        code: nonIllegalError.code,
        error: nonIllegalError,
        ...(nonIllegalError.context === undefined ? {} : { context: nonIllegalError.context }),
      };
    }
    throw error;
  }
};
