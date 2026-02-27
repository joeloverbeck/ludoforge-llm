import { incrementActionUsage } from './action-usage.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { applyBoundaryExpiry } from './boundary-expiry.js';
import { isEffectErrorCode } from './effect-error.js';
import { applyEffects } from './effects.js';
import {
  executeEventMove,
  shouldDeferIncompleteDecisionValidationForMove,
} from './event-execution.js';
import { createCollector } from './execution-collector.js';
import { resolveMoveDecisionSequence } from './move-decision-sequence.js';
import { resolveActionPipelineDispatch, toExecutionPipeline } from './apply-move-pipeline.js';
import { toApplyMoveIllegalReason } from './legality-outcome.js';
import { decideApplyMovePipelineViability, evaluatePipelinePredicateStatus } from './pipeline-viability-policy.js';
import { resolveActionExecutor } from './action-executor.js';
import { evalCondition } from './eval-condition.js';
import { isDeclaredActionParamValueInDomain } from './declared-action-param-domain.js';
import type { EvalContext } from './eval-context.js';
import {
  buildMoveRuntimeBindings,
  collectDecisionBindingsFromEffects,
  deriveDecisionBindingsFromMoveParams,
} from './move-runtime-bindings.js';
import { ILLEGAL_MOVE_REASONS } from './runtime-reasons.js';
import { advanceToDecisionPoint } from './phase-advance.js';
import { illegalMoveError, isKernelErrorCode, isKernelRuntimeError, kernelRuntimeError } from './runtime-error.js';
import { buildAdjacencyGraph } from './spatial.js';
import {
  applyTurnFlowEligibilityAfterMove,
  consumeTurnFlowFreeOperationGrant,
  explainFreeOperationBlockForMove,
  isFreeOperationGrantedForMove,
  resolveFreeOperationExecutionPlayer,
  resolveTurnFlowActionClassMismatch,
} from './turn-flow-eligibility.js';
import { applyTurnFlowWindowFilters, isMoveAllowedByTurnFlowOptionMatrix } from './legal-moves-turn-order.js';
import { isTurnFlowErrorCode } from './turn-flow-error.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import { selectorInvalidSpecError } from './selector-runtime-contract.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { toMoveExecutionPolicy } from './execution-policy.js';
import { validateTurnFlowRuntimeStateInvariants } from './turn-flow-runtime-invariants.js';
import { createDeferredLifecycleTraceEntry } from './turn-flow-deferred-lifecycle-trace.js';
import type { PhaseTransitionBudget } from './effect-context.js';
import type {
  ActionDef,
  ActionPipelineDef,
  ApplyMoveResult,
  ExecutionOptions,
  GameDef,
  GameState,
  Move,
  MoveParamScalar,
  MoveParamValue,
  Rng,
  TurnFlowDeferredEventEffectPayload,
  TurnFlowReleasedDeferredEventEffect,
  TriggerLogEntry,
  TriggerEvent,
} from './types.js';
import { asPlayerId } from './branded.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { computeFullHash, createZobristTable } from './zobrist.js';

const DEFAULT_MAX_TRIGGER_DEPTH = 8;

const findAction = (def: GameDef, actionId: Move['actionId']): ActionDef | undefined =>
  def.actions.find((action) => action.id === actionId);

const decisionBindingsForMove = (
  executionProfile: ReturnType<typeof toExecutionPipeline> | undefined,
  moveParams: Move['params'],
): Readonly<Record<string, MoveParamValue>> => {
  const bindings: Record<string, MoveParamValue> = {
    ...deriveDecisionBindingsFromMoveParams(moveParams),
  };

  if (executionProfile === undefined) {
    return bindings;
  }

  const decisionBindings = new Map<string, string>();
  collectDecisionBindingsFromEffects(executionProfile.costSpend, decisionBindings);
  for (const stage of executionProfile.resolutionStages) {
    collectDecisionBindingsFromEffects(stage, decisionBindings);
  }

  for (const [decisionId, bind] of decisionBindings.entries()) {
    if (Object.prototype.hasOwnProperty.call(moveParams, decisionId)) {
      bindings[bind] = moveParams[decisionId] as MoveParamValue;
    }
  }
  return bindings;
};

const runtimeBindingsForMove = (
  move: Move,
  executionProfile: ReturnType<typeof toExecutionPipeline> | undefined,
): Readonly<Record<string, MoveParamValue | boolean | string>> =>
  buildMoveRuntimeBindings(move, decisionBindingsForMove(executionProfile, move.params));

const resolveMatchedPipelineForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  cachedRuntime?: GameDefRuntime,
): ActionPipelineDef | undefined => {
  const action = findAction(def, move.actionId);
  if (action === undefined) {
    return undefined;
  }
  const adjacencyGraph = cachedRuntime?.adjacencyGraph ?? buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = cachedRuntime?.runtimeTableIndex ?? buildRuntimeTableIndex(def);
  const executionPlayer = move.freeOperation === true
    ? resolveFreeOperationExecutionPlayer(def, state, move)
    : (() => {
      const resolution = resolveActionExecutor({
        def,
        state,
        adjacencyGraph,
        action,
        decisionPlayer: state.activePlayer,
        bindings: runtimeBindingsForMove(move, undefined),
        runtimeTableIndex,
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
  const dispatch = resolveActionPipelineDispatch(def, action, {
    def,
    adjacencyGraph,
    runtimeTableIndex,
    state,
    activePlayer: executionPlayer,
    actorPlayer: executionPlayer,
    bindings: runtimeBindingsForMove(move, undefined),
    collector: createCollector(),
  });
  if (dispatch.kind !== 'matched') {
    return undefined;
  }
  return dispatch.profile;
};

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
): void => {
  try {
    const result = resolveMoveDecisionSequence(def, state, move, {
      choose: () => undefined,
    });
    if (result.complete) {
      return;
    }
    if (result.illegal !== undefined) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE, {
        detail: result.illegal.reason,
      });
    }
    if (options?.allowIncomplete === true) {
      return;
    }
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_HAS_INCOMPLETE_PARAMS, {
      nextDecisionId: result.nextDecision?.decisionId,
      nextDecisionName: result.nextDecision?.name,
    });
  } catch (err) {
    if (isEffectErrorCode(err, 'EFFECT_RUNTIME') && err.context?.reason === 'choiceRuntimeValidationFailed') {
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

const validateDeclaredActionParams = (action: ActionDef, evalCtx: EvalContext, move: Move): void => {
  for (const param of action.params) {
    if (!isDeclaredActionParamValueInDomain(param, move.params[param.name], evalCtx)) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION);
    }
  }
};

interface ValidatedMoveContext {
  readonly preflight: MovePreflightContext;
}

interface MovePreflightContext {
  readonly action: ActionDef;
  readonly executionPlayer: GameState['activePlayer'];
  readonly evalCtx: EvalContext;
  readonly baseBindings: Readonly<Record<string, MoveParamValue | boolean | string>>;
  readonly actionPipeline: ActionPipelineDef | undefined;
  readonly executionProfile: ReturnType<typeof toExecutionPipeline> | undefined;
  readonly costValidationPassed: boolean;
  readonly isFreeOperationPipeline: boolean;
}

const validateTurnFlowWindowAccess = (def: GameDef, state: GameState, move: Move): void => {
  if (!isMoveAllowedByTurnFlowOptionMatrix(def, state, move)) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE, {
      detail: 'turnFlow option matrix rejected move action class',
    });
  }
  if (applyTurnFlowWindowFilters(def, state, [move]).length === 0) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE, {
      detail: 'turnFlow window filters rejected move',
    });
  }
};

const validateSpecialActivityCompoundConstraints = (
  def: GameDef,
  state: GameState,
  move: Move,
  action: ActionDef,
  cachedRuntime?: GameDefRuntime,
): void => {
  if (move.compound === undefined) {
    return;
  }
  const saMove = move.compound.specialActivity;
  const saPipeline = resolveMatchedPipelineForMove(def, state, saMove, cachedRuntime);
  if (saPipeline !== undefined && !operationAllowsSpecialActivity(move.actionId, saPipeline.accompanyingOps)) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED, {
      operationActionId: action.id,
      specialActivityActionId: saMove.actionId,
      profileId: saPipeline.id,
    });
  }
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
  evalCtx: EvalContext,
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
  adjacencyGraph: ReturnType<typeof buildAdjacencyGraph>,
  runtimeTableIndex: ReturnType<typeof buildRuntimeTableIndex>,
  mode: 'validation' | 'execution',
  cachedRuntime?: GameDefRuntime,
): MovePreflightContext => {
  const action = findAction(def, move.actionId);
  if (action === undefined) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID);
  }
  const baseBindings = runtimeBindingsForMove(move, undefined);
  const preflightEvalCtx = mode === 'validation'
    ? (() => {
      const preflight = resolveActionApplicabilityPreflight({
        def,
        state,
        action,
        adjacencyGraph,
        decisionPlayer: state.activePlayer,
        bindings: baseBindings,
        runtimeTableIndex,
        ...(move.freeOperation === true
          ? { executionPlayerOverride: resolveFreeOperationExecutionPlayer(def, state, move) }
          : {}),
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
        ? resolveFreeOperationExecutionPlayer(def, state, move)
        : (() => {
          const resolution = resolveActionExecutor({
            def,
            state,
            adjacencyGraph,
            action,
            decisionPlayer: state.activePlayer,
            bindings: baseBindings,
            runtimeTableIndex,
          });
          if (resolution.kind === 'notApplicable') {
            throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_EXECUTOR_NOT_APPLICABLE);
          }
          if (resolution.kind === 'invalidSpec') {
            throw selectorInvalidSpecError('applyMove', 'executor', action, resolution.error);
          }
          return resolution.executionPlayer;
        })();
      const evalCtx = {
        def,
        adjacencyGraph,
        runtimeTableIndex,
        state,
        activePlayer: executionPlayer,
        actorPlayer: executionPlayer,
        bindings: baseBindings,
        collector: createCollector(),
      };
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
  validateSpecialActivityCompoundConstraints(def, state, move, action, cachedRuntime);

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
  cachedRuntime?: GameDefRuntime,
): ValidatedMoveContext => {
  const classMismatch = resolveTurnFlowActionClassMismatch(def, move);
  if (classMismatch !== null) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH, {
      actionId: move.actionId,
      mappedActionClass: classMismatch.mapped,
      submittedActionClass: classMismatch.submitted,
    });
  }
  const adjacencyGraph = cachedRuntime?.adjacencyGraph ?? buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = cachedRuntime?.runtimeTableIndex ?? buildRuntimeTableIndex(def);
  const preflight = resolveMovePreflightContext(def, state, move, adjacencyGraph, runtimeTableIndex, 'validation', cachedRuntime);
  const action = preflight.action;
  const allowIncomplete = shouldDeferIncompleteDecisionValidationForMove(def, state, move);

  if (
    move.freeOperation === true &&
    state.turnOrderState.type === 'cardDriven' &&
    !isFreeOperationGrantedForMove(def, state, move)
  ) {
    const block = explainFreeOperationBlockForMove(def, state, move);
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED, {
      actionId: action.id,
      block,
    });
  }
  if (action.pre !== null && !evalCondition(action.pre, preflight.evalCtx)) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE);
  }
  if (preflight.actionPipeline === undefined) {
    validateDeclaredActionParams(action, preflight.evalCtx, move);
  }
  validateDecisionSequenceForMove(def, state, move, {
    allowIncomplete,
  });
  validateTurnFlowWindowAccess(def, state, move);
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
  readonly collector: ReturnType<typeof createCollector>;
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
  options: ExecutionOptions | undefined,
  coreOptions: ApplyMoveCoreOptions | undefined,
  shared: SharedMoveExecutionContext,
  cachedRuntime?: GameDefRuntime,
): MoveActionExecutionResult => {
  const validated = coreOptions?.skipValidation === true ? null : validateMove(def, state, move, cachedRuntime);
  const preflight = validated?.preflight ?? resolveMovePreflightContext(
    def,
    state,
    move,
    shared.adjacencyGraph,
    shared.runtimeTableIndex,
    'execution',
    cachedRuntime,
  );
  const {
    action,
    executionPlayer,
    baseBindings,
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
    decisionAuthority: { source: 'engineRuntime' as const, player: executionPlayer },
    bindings: baseBindings,
    moveParams: move.params,
    collector: shared.collector,
    mode: 'execution' as const,
    traceContext: {
      eventContext: 'actionEffect' as const,
      actionId: String(action.id),
      effectPathRoot: `action:${String(action.id)}.effects`,
    },
    effectPath: '',
    ...(shared.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: shared.phaseTransitionBudget }),
  } as const;
  const resolvedDecisionBindings = decisionBindingsForMove(executionProfile, move.params);
  const runtimeMoveParams = {
    ...move.params,
    ...resolvedDecisionBindings,
  };
  const effectCtx = {
    ...effectCtxBase,
    bindings: buildMoveRuntimeBindings(move, resolvedDecisionBindings),
    moveParams: runtimeMoveParams,
  } as const;

  const shouldSpendCost = !isFreeOperationPipeline && (
    executionProfile === undefined ||
    executionProfile.costValidation === null ||
    costValidationPassed);
  const costEffects = executionProfile?.costSpend ?? action.cost;
  const costResult = shouldSpendCost
    ? applyEffects(costEffects, {
      ...effectCtx,
      state,
      rng,
      traceContext: {
        eventContext: 'actionCost',
        actionId: String(action.id),
        effectPathRoot: `action:${String(action.id)}.cost`,
      },
      effectPath: '',
    })
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
      options,
      shared.phaseTransitionBudget === undefined ? undefined : { phaseTransitionBudget: shared.phaseTransitionBudget },
      shared,
      cachedRuntime,
    );
    effectState = saResult.stateWithRng;
    effectRng = { state: effectState.rng };
    executionTraceEntries.push(...saResult.triggerFirings);
  };

  if (move.compound?.timing === 'before') {
    applyCompoundSA();
  }

  if (executionProfile === undefined) {
    const effectResult = applyEffects(action.effects, {
      ...effectCtx,
      state: effectState,
      rng: effectRng,
      traceContext: {
        eventContext: 'actionEffect',
        actionId: String(action.id),
        effectPathRoot: `action:${String(action.id)}.effects`,
      },
      effectPath: '',
    });
    effectState = effectResult.state;
    effectRng = effectResult.rng;
    if (effectResult.emittedEvents !== undefined) {
      emittedEvents.push(...effectResult.emittedEvents);
    }
  } else {
    const insertAfter = move.compound?.timing === 'during' ? (move.compound.insertAfterStage ?? 0) : -1;
    for (const [stageIdx, stageEffects] of executionProfile.resolutionStages.entries()) {
      const stageResult = applyEffects(stageEffects, {
        ...effectCtx,
        state: effectState,
        rng: effectRng,
        traceContext: {
          eventContext: 'actionEffect',
          actionId: String(action.id),
          effectPathRoot: `action:${String(action.id)}.stages[${stageIdx}]`,
        },
        effectPath: '',
      });
      effectState = stageResult.state;
      effectRng = stageResult.rng;
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
    shared.collector,
    String(action.id),
  );
  effectState = lastingActivation.state;
  effectRng = lastingActivation.rng;
  if (lastingActivation.emittedEvents.length > 0) {
    emittedEvents.push(...lastingActivation.emittedEvents);
  }

  const stateWithUsage = incrementActionUsage(effectState, action.id);
  const maxDepth = def.metadata.maxTriggerDepth ?? DEFAULT_MAX_TRIGGER_DEPTH;
  let triggerState = stateWithUsage;
  let triggerRng = effectRng;
  let triggerLog = [] as ApplyMoveResult['triggerFirings'];

  for (const emittedEvent of emittedEvents) {
    const emittedEventResult = dispatchTriggers(
      def,
      triggerState,
      triggerRng,
      emittedEvent,
      0,
      maxDepth,
      triggerLog,
      shared.adjacencyGraph,
      shared.runtimeTableIndex,
      shared.executionPolicy,
      shared.collector,
      `action:${String(action.id)}.emittedEvent(${emittedEvent.type})`,
    );
    triggerState = emittedEventResult.state;
    triggerRng = emittedEventResult.rng;
    triggerLog = emittedEventResult.triggerLog;
  }

  const triggerResult = dispatchTriggers(
    def,
    triggerState,
    triggerRng,
    { type: 'actionResolved', action: move.actionId },
    0,
    maxDepth,
    triggerLog,
    shared.adjacencyGraph,
    shared.runtimeTableIndex,
    shared.executionPolicy,
    shared.collector,
    `action:${String(action.id)}.actionResolved`,
  );

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
    const effectResult = applyEffects(deferredEventEffect.effects, {
      def,
      adjacencyGraph: shared.adjacencyGraph,
      runtimeTableIndex: shared.runtimeTableIndex,
      state: nextState,
      rng: nextRng,
      activePlayer: effectPlayer,
      actorPlayer: effectPlayer,
      decisionAuthority: { source: 'engineRuntime', player: effectPlayer },
      bindings: { ...deferredEventEffect.moveParams },
      moveParams: deferredEventEffect.moveParams,
      collector: shared.collector,
      mode: 'execution',
      traceContext: {
        eventContext: 'actionEffect',
        actionId: deferredEventEffect.actionId,
        effectPathRoot: `action:${deferredEventEffect.actionId}.deferredEventEffects`,
      },
      effectPath: '',
      ...(shared.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: shared.phaseTransitionBudget }),
    });
    nextState = effectResult.state;
    nextRng = effectResult.rng;
    for (const emittedEvent of effectResult.emittedEvents ?? []) {
      const emittedEventResult = dispatchTriggers(
        def,
        nextState,
        nextRng,
        emittedEvent,
        0,
        maxDepth,
        triggerLog,
        shared.adjacencyGraph,
        shared.runtimeTableIndex,
        shared.executionPolicy,
        shared.collector,
        `action:${deferredEventEffect.actionId}.deferredEvent(${emittedEvent.type})`,
      );
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
  validateTurnFlowRuntimeStateInvariants(state);
  const adjacencyGraph = cachedRuntime?.adjacencyGraph ?? buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = cachedRuntime?.runtimeTableIndex ?? buildRuntimeTableIndex(def);
  const runtime = coreOptions?.executionRuntime ?? createMoveExecutionRuntime(options, coreOptions?.phaseTransitionBudget);
  if (coreOptions?.executionRuntime !== undefined) {
    validatedMaxPhaseTransitionsPerMove(options);
  }
  const shared: SharedMoveExecutionContext = {
    adjacencyGraph,
    runtimeTableIndex,
    collector: runtime.collector,
    ...(runtime.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: runtime.phaseTransitionBudget }),
    ...(runtime.executionPolicy === undefined ? {} : { executionPolicy: runtime.executionPolicy }),
  };

  const executed = executeMoveAction(def, state, move, options, coreOptions, shared, cachedRuntime);
  const turnFlowResult = move.freeOperation === true
    ? (() => {
      const consumed = consumeTurnFlowFreeOperationGrant(def, executed.stateWithRng, move);
      return {
        state: consumed.state,
        traceEntries: consumed.traceEntries,
        boundaryDurations: undefined,
        releasedDeferredEventEffects: consumed.releasedDeferredEventEffects,
      };
    })()
    : applyTurnFlowEligibilityAfterMove(def, executed.stateWithRng, move, executed.deferredEventEffect);
  const deferredExecution = applyReleasedDeferredEventEffects(
    def,
    turnFlowResult.state,
    turnFlowResult.releasedDeferredEventEffects ?? [],
    shared,
  );
  const boundaryExpiryResult = applyBoundaryExpiry(
    def,
    deferredExecution.stateWithRng,
    turnFlowResult.boundaryDurations,
    undefined,
    shared.executionPolicy,
    shared.collector,
  );
  const lifecycleAndAdvanceLog: TriggerLogEntry[] = [];
  const shouldAdvanceToDecisionPoint =
    coreOptions?.skipAdvanceToDecisionPoint !== true
    && options?.advanceToDecisionPoint !== false;
  const progressedState = shouldAdvanceToDecisionPoint
    ? advanceToDecisionPoint(
      def,
      boundaryExpiryResult.state,
      lifecycleAndAdvanceLog,
      runtime.executionPolicy,
      runtime.collector,
      cachedRuntime,
    )
    : boundaryExpiryResult.state;

  const stateWithHash = {
    ...progressedState,
    stateHash: computeFullHash(cachedRuntime?.zobristTable ?? createZobristTable(def), progressedState),
  };

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
  };
};

const createSimultaneousSubmittedMap = (playerCount: number): Readonly<Record<number, boolean>> =>
  Object.fromEntries(Array.from({ length: playerCount }, (_unused, index) => [index, false]));

const toSimultaneousSubmission = (move: Move) => ({
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

  validateMove(def, state, move, cachedRuntime, options);

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
    : advanceToDecisionPoint(def, resetState, lifecycleAndAdvanceLog, commitRuntime.executionPolicy, commitRuntime.collector, cachedRuntime);
  const finalState = {
    ...progressedState,
    stateHash: computeFullHash(table, progressedState),
  };

  return {
    state: finalState,
    triggerFirings: [...triggerFirings, ...lifecycleAndAdvanceLog],
    warnings: commitRuntime.collector.warnings,
    ...(commitRuntime.collector.trace === null ? {} : { effectTrace: commitRuntime.collector.trace }),
  };
};

export const applyMove = (def: GameDef, state: GameState, move: Move, options?: ExecutionOptions, runtime?: GameDefRuntime): ApplyMoveResult => {
  if (def.turnOrder?.type === 'simultaneous') {
    return applySimultaneousSubmission(def, state, move, options, runtime);
  }
  return applyMoveCore(def, state, move, options, undefined, runtime);
};
