import { incrementActionUsage } from './action-usage.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { isEffectErrorCode } from './effect-error.js';
import { applyEffects } from './effects.js';
import { executeEventMove } from './event-execution.js';
import { createCollector } from './execution-collector.js';
import { resolveMoveDecisionSequence } from './move-decision-sequence.js';
import { resolveActionPipelineDispatch, toExecutionPipeline } from './apply-move-pipeline.js';
import { toApplyMoveIllegalReason } from './legality-outcome.js';
import { decideApplyMovePipelineViability, evaluatePipelinePredicateStatus } from './pipeline-viability-policy.js';
import { resolveActionExecutor } from './action-executor.js';
import { evalCondition } from './eval-condition.js';
import { evalQuery, isInIntRangeDomain } from './eval-query.js';
import type { EvalContext } from './eval-context.js';
import {
  buildMoveRuntimeBindings,
  collectDecisionBindingsFromEffects,
  deriveDecisionBindingsFromMoveParams,
} from './move-runtime-bindings.js';
import { ILLEGAL_MOVE_REASONS } from './runtime-reasons.js';
import { advanceToDecisionPoint } from './phase-advance.js';
import { illegalMoveError, isKernelErrorCode, isKernelRuntimeError } from './runtime-error.js';
import { buildAdjacencyGraph } from './spatial.js';
import {
  applyTurnFlowEligibilityAfterMove,
  consumeTurnFlowFreeOperationGrant,
  isFreeOperationGrantedForMove,
  resolveFreeOperationExecutionPlayer,
} from './turn-flow-eligibility.js';
import { isTurnFlowErrorCode } from './turn-flow-error.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import { selectorInvalidSpecError } from './selector-runtime-contract.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { toMoveExecutionPolicy } from './execution-policy.js';
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
  TriggerLogEntry,
  TriggerEvent,
} from './types.js';
import { asPlayerId } from './branded.js';
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
): ActionPipelineDef | undefined => {
  const action = findAction(def, move.actionId);
  if (action === undefined) {
    return undefined;
  }
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
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
    ...(def.mapSpaces === undefined ? {} : { mapSpaces: def.mapSpaces }),
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

const validateDecisionSequenceForMove = (def: GameDef, state: GameState, move: Move): void => {
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

const isMoveParamScalar = (value: unknown): value is MoveParamScalar =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const normalizeMoveParamValue = (value: unknown): MoveParamValue | null => {
  if (isMoveParamScalar(value)) {
    return value;
  }
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { readonly id?: unknown }).id;
    return isMoveParamScalar(id) ? id : null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const normalized: MoveParamScalar[] = [];
  for (const entry of value) {
    if (isMoveParamScalar(entry)) {
      normalized.push(entry);
      continue;
    }
    if (typeof entry === 'object' && entry !== null && 'id' in entry) {
      const id = (entry as { readonly id?: unknown }).id;
      if (isMoveParamScalar(id)) {
        normalized.push(id);
        continue;
      }
    }
    return null;
  }
  return normalized;
};

const isSameMoveParamValue = (left: MoveParamValue, right: MoveParamValue): boolean => {
  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);
  if (leftIsArray || rightIsArray) {
    if (!leftIsArray || !rightIsArray || left.length !== right.length) {
      return false;
    }
    return left.every((entry, index) => Object.is(entry, right[index]));
  }
  return Object.is(left, right);
};

const validateDeclaredActionParams = (action: ActionDef, evalCtx: EvalContext, move: Move): void => {
  for (const param of action.params) {
    const selected = move.params[param.name];
    const selectedNormalized = normalizeMoveParamValue(selected);
    if (selectedNormalized === null) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION);
    }
    if (
      param.domain.query === 'intsInRange'
      || param.domain.query === 'intsInVarRange'
    ) {
      if (!isInIntRangeDomain(param.domain, selectedNormalized, evalCtx)) {
        throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION);
      }
      continue;
    }
    const domainValues = evalQuery(param.domain, evalCtx);
    const inDomain = domainValues.some((candidate) => {
      const normalizedCandidate = normalizeMoveParamValue(candidate);
      return normalizedCandidate !== null && isSameMoveParamValue(selectedNormalized, normalizedCandidate);
    });
    if (!inDomain) {
      throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION);
    }
  }
};

interface ValidatedMoveContext {
  readonly action: ActionDef;
  readonly executionPlayer: GameState['activePlayer'];
}

const validateMove = (def: GameDef, state: GameState, move: Move): ValidatedMoveContext => {
  const action = findAction(def, move.actionId);
  if (action === undefined) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID);
  }

  if (move.compound !== undefined) {
    const saMove = move.compound.specialActivity;
    const saPipeline = resolveMatchedPipelineForMove(def, state, saMove);
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
  }

  if (
    move.freeOperation === true &&
    state.turnOrderState.type === 'cardDriven' &&
    !isFreeOperationGrantedForMove(def, state, move)
  ) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED, {
      actionId: action.id,
    });
  }

  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
  const preflight = resolveActionApplicabilityPreflight({
    def,
    state,
    action,
    adjacencyGraph,
    decisionPlayer: state.activePlayer,
    bindings: runtimeBindingsForMove(move, undefined),
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
  if (action.pre !== null && !evalCondition(action.pre, preflight.evalCtx)) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE);
  }

  if (preflight.pipelineDispatch.kind === 'matched') {
    const pipeline = preflight.pipelineDispatch.profile;
    const status = evaluatePipelinePredicateStatus(action, pipeline, preflight.evalCtx);
    const viabilityDecision = decideApplyMovePipelineViability(status, { isFreeOperation: move.freeOperation === true });
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
    validateDecisionSequenceForMove(def, state, move);
    return {
      action,
      executionPlayer: preflight.executionPlayer,
    };
  }
  validateDeclaredActionParams(action, preflight.evalCtx, move);
  validateDecisionSequenceForMove(def, state, move);
  return {
    action,
    executionPlayer: preflight.executionPlayer,
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
): MoveActionExecutionResult => {
  const validated = coreOptions?.skipValidation === true ? null : validateMove(def, state, move);
  const action = validated?.action ?? findAction(def, move.actionId);
  if (action === undefined) throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID);

  const rng: Rng = { state: state.rng };
  const baseBindings = runtimeBindingsForMove(move, undefined);
  const executionPlayer = validated?.executionPlayer ?? (
    move.freeOperation === true
      ? resolveFreeOperationExecutionPlayer(def, state, move)
      : (() => {
        const resolution = resolveActionExecutor({
          def,
          state,
          adjacencyGraph: shared.adjacencyGraph,
          action,
          decisionPlayer: state.activePlayer,
          bindings: baseBindings,
          runtimeTableIndex: shared.runtimeTableIndex,
        });
        if (resolution.kind === 'notApplicable') {
          throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_EXECUTOR_NOT_APPLICABLE);
        }
        if (resolution.kind === 'invalidSpec') {
          throw selectorInvalidSpecError('applyMove', 'executor', action, resolution.error);
        }
        return resolution.executionPlayer;
      })()
  );
  const effectCtxBase = {
    def,
    adjacencyGraph: shared.adjacencyGraph,
    runtimeTableIndex: shared.runtimeTableIndex,
    activePlayer: executionPlayer,
    actorPlayer: executionPlayer,
    bindings: baseBindings,
    moveParams: move.params,
    collector: shared.collector,
    ...(shared.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: shared.phaseTransitionBudget }),
    ...(def.mapSpaces === undefined ? {} : { mapSpaces: def.mapSpaces }),
  } as const;

  const pipelineDispatch = resolveActionPipelineDispatch(def, action, { ...effectCtxBase, state });
  if (pipelineDispatch.kind === 'configuredNoMatch') {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE);
  }
  const actionPipeline = pipelineDispatch.kind === 'matched' ? pipelineDispatch.profile : undefined;
  const executionProfile = actionPipeline === undefined ? undefined : toExecutionPipeline(action, actionPipeline);
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
  const isFreeOp = move.freeOperation === true && executionProfile !== undefined;

  if (move.compound !== undefined) {
    const saMove = move.compound.specialActivity;
    const saPipeline = resolveMatchedPipelineForMove(def, state, saMove);
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
  }

  let costValidationPassed = true;
  if (actionPipeline !== undefined) {
    const status = evaluatePipelinePredicateStatus(action, actionPipeline, { ...effectCtx, state });
    const viabilityDecision = decideApplyMovePipelineViability(status, { isFreeOperation: isFreeOp });
    if (viabilityDecision.kind === 'illegalMove') {
      if (viabilityDecision.outcome === 'pipelineAtomicCostValidationFailed') {
        throw illegalMoveError(move, toApplyMoveIllegalReason(viabilityDecision.outcome), {
          profileId: actionPipeline.id,
          partialExecutionMode: actionPipeline.atomicity,
        });
      }
      throw illegalMoveError(move, toApplyMoveIllegalReason(viabilityDecision.outcome), {
        profileId: actionPipeline.id,
      });
    }
    costValidationPassed = viabilityDecision.costValidationPassed;
  }

  const shouldSpendCost = !isFreeOp && (
    executionProfile === undefined ||
    executionProfile.costValidation === null ||
    costValidationPassed);
  const costEffects = executionProfile?.costSpend ?? action.cost;
  const costResult = shouldSpendCost
    ? applyEffects(costEffects, {
      ...effectCtx,
      state,
      rng,
    })
    : { state, rng };

  let effectState = costResult.state;
  let effectRng = costResult.rng;
  const emittedEvents: TriggerEvent[] = [];
  const executionTraceEntries: TriggerLogEntry[] = [];

  if (isFreeOp) {
    executionTraceEntries.push({
      kind: 'operationFree',
      actionId: action.id,
      step: 'costSpendSkipped',
    });
  } else if (executionProfile !== undefined && executionProfile.partialMode === 'partial' && !costValidationPassed) {
    executionTraceEntries.push({
      kind: 'operationPartial',
      actionId: action.id,
      profileId: actionPipeline?.id ?? 'unknown',
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
      });
      effectState = stageResult.state;
      effectRng = stageResult.rng;
      if (stageResult.emittedEvents !== undefined) {
        emittedEvents.push(...stageResult.emittedEvents);
      }
      if (stageIdx === insertAfter) {
        applyCompoundSA();
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
  );

  return {
    stateWithRng: {
      ...triggerResult.state,
      rng: triggerResult.rng.state,
    },
    triggerFirings: [...executionTraceEntries, ...triggerResult.triggerLog],
  };
};

const applyMoveCore = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: ExecutionOptions,
  coreOptions?: ApplyMoveCoreOptions,
): ApplyMoveResult => {
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
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

  const executed = executeMoveAction(def, state, move, options, coreOptions, shared);
  const turnFlowResult = move.freeOperation === true
    ? { state: consumeTurnFlowFreeOperationGrant(def, executed.stateWithRng, move), traceEntries: [] as readonly TriggerLogEntry[] }
    : applyTurnFlowEligibilityAfterMove(def, executed.stateWithRng, move);
  const lifecycleAndAdvanceLog: TriggerLogEntry[] = [];
  const shouldAdvanceToDecisionPoint =
    coreOptions?.skipAdvanceToDecisionPoint !== true
    && options?.advanceToDecisionPoint !== false;
  const progressedState = shouldAdvanceToDecisionPoint
    ? advanceToDecisionPoint(
      def,
      turnFlowResult.state,
      lifecycleAndAdvanceLog,
      runtime.executionPolicy,
      runtime.collector,
    )
    : turnFlowResult.state;

  const stateWithHash = {
    ...progressedState,
    stateHash: computeFullHash(createZobristTable(def), progressedState),
  };

  return {
    state: stateWithHash,
    triggerFirings: [...executed.triggerFirings, ...turnFlowResult.traceEntries, ...lifecycleAndAdvanceLog],
    warnings: runtime.collector.warnings,
    ...(runtime.collector.trace !== null ? { effectTrace: runtime.collector.trace } : {}),
  };
};

const createSimultaneousSubmittedMap = (playerCount: number): Readonly<Record<string, boolean>> =>
  Object.fromEntries(Array.from({ length: playerCount }, (_unused, index) => [String(index), false]));

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
  player: string,
  move: ReturnType<typeof toSimultaneousSubmission>,
  submittedBefore: Readonly<Record<string, boolean>>,
  submittedAfter: Readonly<Record<string, boolean>>,
): TriggerLogEntry => ({
  kind: 'simultaneousSubmission',
  player,
  move,
  submittedBefore,
  submittedAfter,
});

const nextUnsubmittedPlayer = (
  currentPlayer: number,
  submitted: Readonly<Record<string, boolean>>,
  playerCount: number,
): number | null => {
  for (let offset = 1; offset <= playerCount; offset += 1) {
    const candidate = (currentPlayer + offset) % playerCount;
    if (submitted[String(candidate)] !== true) {
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
): ApplyMoveResult => {
  validatedMaxPhaseTransitionsPerMove(options);
  if (move.compound !== undefined) {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.SIMULTANEOUS_SUBMISSION_COMPOUND_UNSUPPORTED);
  }
  if (state.turnOrderState.type !== 'simultaneous') {
    throw illegalMoveError(move, ILLEGAL_MOVE_REASONS.SIMULTANEOUS_RUNTIME_STATE_REQUIRED);
  }

  validateMove(def, state, move);

  const currentPlayer = Number(state.activePlayer);
  const playerKey = String(currentPlayer);
  const submittedBefore = state.turnOrderState.submitted;
  const submittedMove = toSimultaneousSubmission(move);
  const submitted = {
    ...submittedBefore,
    [playerKey]: true,
  };
  const pending = {
    ...state.turnOrderState.pending,
    [playerKey]: submittedMove,
  };
  const table = createZobristTable(def);
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
      triggerFirings: [simultaneousSubmissionTrace(playerKey, submittedMove, submittedBefore, submitted)],
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
    simultaneousSubmissionTrace(playerKey, submittedMove, submittedBefore, submitted),
    {
      kind: 'simultaneousCommit',
      playersInOrder: orderedPlayers.map(String),
      pendingCount: Object.keys(pending).length,
    },
  ];
  const commitRuntime = createMoveExecutionRuntime(options);

  for (const player of orderedPlayers) {
    const submission = pending[String(player)];
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
    : advanceToDecisionPoint(def, resetState, lifecycleAndAdvanceLog, commitRuntime.executionPolicy, commitRuntime.collector);
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

export const applyMove = (def: GameDef, state: GameState, move: Move, options?: ExecutionOptions): ApplyMoveResult => {
  if (def.turnOrder?.type === 'simultaneous') {
    return applySimultaneousSubmission(def, state, move, options);
  }
  return applyMoveCore(def, state, move, options);
};
