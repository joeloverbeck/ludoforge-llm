import { incrementActionUsage } from './action-usage.js';
import { evalCondition } from './eval-condition.js';
import { applyEffects } from './effects.js';
import { executeEventMove } from './event-execution.js';
import { createCollector } from './execution-collector.js';
import { legalMoves } from './legal-moves.js';
import { resolveMoveDecisionSequence } from './move-decision-sequence.js';
import { resolveActionPipelineDispatch, toExecutionPipeline } from './apply-move-pipeline.js';
import { resolveActionExecutorPlayer } from './action-executor.js';
import { extractResolvedBindFromDecisionId } from './decision-id.js';
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
import type {
  ActionDef,
  ActionPipelineDef,
  ApplyMoveResult,
  EffectAST,
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

const isScalarParamEqual = (left: MoveParamValue, right: MoveParamValue): boolean => {
  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);

  if (leftIsArray || rightIsArray) {
    if (!leftIsArray || !rightIsArray || left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      if (!Object.is(left[index], right[index])) {
        return false;
      }
    }

    return true;
  }

  return Object.is(left, right);
};

const areMoveParamsEqual = (
  left: Readonly<Record<string, MoveParamValue>>,
  right: Readonly<Record<string, MoveParamValue>>,
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => key in right && isScalarParamEqual(left[key] as MoveParamValue, right[key] as MoveParamValue));
};

const isSameMove = (left: Move, right: Move): boolean =>
  left.actionId === right.actionId && areMoveParamsEqual(left.params, right.params);

const hasChoiceEffects = (effects: readonly EffectAST[]): boolean => {
  for (const effect of effects) {
    if ('chooseOne' in effect || 'chooseN' in effect) {
      return true;
    }
    if ('if' in effect) {
      if (hasChoiceEffects(effect.if.then)) {
        return true;
      }
      if (effect.if.else !== undefined && hasChoiceEffects(effect.if.else)) {
        return true;
      }
      continue;
    }
    if ('forEach' in effect) {
      if (hasChoiceEffects(effect.forEach.effects)) {
        return true;
      }
      if (effect.forEach.in !== undefined && hasChoiceEffects(effect.forEach.in)) {
        return true;
      }
      continue;
    }
    if ('removeByPriority' in effect) {
      if (effect.removeByPriority.in !== undefined && hasChoiceEffects(effect.removeByPriority.in)) {
        return true;
      }
      continue;
    }
    if ('let' in effect) {
      if (hasChoiceEffects(effect.let.in)) {
        return true;
      }
      continue;
    }
    if ('rollRandom' in effect && hasChoiceEffects(effect.rollRandom.in)) {
      return true;
    }
  }
  return false;
};

const pickDeclaredActionParams = (action: ActionDef, params: Move['params']): Readonly<Record<string, MoveParamValue>> => {
  const paramNames = new Set(action.params.map((param) => param.name));
  const selected: Record<string, MoveParamValue> = {};
  for (const [name, value] of Object.entries(params)) {
    if (paramNames.has(name)) {
      selected[name] = value as MoveParamValue;
    }
  }
  return selected;
};

const findAction = (def: GameDef, actionId: Move['actionId']): ActionDef | undefined =>
  def.actions.find((action) => action.id === actionId);

const collectDecisionBindings = (effects: readonly EffectAST[], bindings: Map<string, string>): void => {
  for (const effect of effects) {
    if ('chooseOne' in effect) {
      bindings.set(effect.chooseOne.internalDecisionId, effect.chooseOne.bind);
      continue;
    }
    if ('chooseN' in effect) {
      bindings.set(effect.chooseN.internalDecisionId, effect.chooseN.bind);
      continue;
    }
    if ('if' in effect) {
      collectDecisionBindings(effect.if.then, bindings);
      if (effect.if.else !== undefined) {
        collectDecisionBindings(effect.if.else, bindings);
      }
      continue;
    }
    if ('forEach' in effect) {
      collectDecisionBindings(effect.forEach.effects, bindings);
      if (effect.forEach.in !== undefined) {
        collectDecisionBindings(effect.forEach.in, bindings);
      }
      continue;
    }
    if ('removeByPriority' in effect) {
      if (effect.removeByPriority.in !== undefined) {
        collectDecisionBindings(effect.removeByPriority.in, bindings);
      }
      continue;
    }
    if ('let' in effect) {
      collectDecisionBindings(effect.let.in, bindings);
      continue;
    }
    if ('rollRandom' in effect) {
      collectDecisionBindings(effect.rollRandom.in, bindings);
    }
  }
};

const decisionBindingsForMove = (
  executionProfile: ReturnType<typeof toExecutionPipeline> | undefined,
  moveParams: Move['params'],
): Readonly<Record<string, MoveParamValue>> => {
  const bindings: Record<string, MoveParamValue> = {};
  for (const [paramName, paramValue] of Object.entries(moveParams)) {
    const resolvedBind = extractResolvedBindFromDecisionId(paramName);
    if (resolvedBind !== null) {
      bindings[resolvedBind] = paramValue as MoveParamValue;
    }
  }

  if (executionProfile === undefined) {
    return bindings;
  }

  const decisionBindings = new Map<string, string>();
  collectDecisionBindings(executionProfile.costSpend, decisionBindings);
  for (const stage of executionProfile.resolutionStages) {
    collectDecisionBindings(stage, decisionBindings);
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
): Readonly<Record<string, MoveParamValue | boolean | string>> => ({
  ...move.params,
  ...decisionBindingsForMove(executionProfile, move.params),
  __freeOperation: move.freeOperation ?? false,
  __actionClass: move.actionClass ?? 'operation',
});

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
  const executionPlayer = move.freeOperation === true
    ? resolveFreeOperationExecutionPlayer(def, state, move)
    : resolveActionExecutorPlayer({
      def,
      state,
      adjacencyGraph,
      action,
      decisionPlayer: state.activePlayer,
      bindings: runtimeBindingsForMove(move, undefined),
    });
  const dispatch = resolveActionPipelineDispatch(def, action, {
    def,
    adjacencyGraph,
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

const validateMove = (def: GameDef, state: GameState, move: Move): void => {
  const action = findAction(def, move.actionId);
  if (action === undefined) {
    throw illegalMoveError(move, 'unknown action id');
  }

  if (move.compound !== undefined) {
    const saMove = move.compound.specialActivity;
    const saPipeline = resolveMatchedPipelineForMove(def, state, saMove);
    if (saPipeline !== undefined && !operationAllowsSpecialActivity(move.actionId, saPipeline.accompanyingOps)) {
      throw illegalMoveError(move, 'special activity cannot accompany this operation', {
        code: 'SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED',
        operationActionId: action.id,
        specialActivityActionId: saMove.actionId,
        profileId: saPipeline.id,
      });
    }
    if (saPipeline !== undefined) {
      const violated = violatesCompoundParamConstraints(move, saMove, saPipeline);
      if (violated !== null) {
        throw illegalMoveError(move, 'special activity violates compound param constraints', {
          code: 'SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED',
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

  const hasPipeline = (def.actionPipelines ?? []).some((pipeline) => pipeline.actionId === action.id);

  if (
    move.freeOperation === true &&
    state.turnOrderState.type === 'cardDriven' &&
    !isFreeOperationGrantedForMove(def, state, move)
  ) {
    throw illegalMoveError(move, 'free operation is not granted in current state', {
      code: 'FREE_OPERATION_NOT_GRANTED',
      actionId: action.id,
    });
  }

  if (hasPipeline) {
    const legal = legalMoves(def, state);
    const hasTemplate = legal.some((candidate) => candidate.actionId === action.id);
    if (!hasTemplate && move.freeOperation !== true) {
      throw illegalMoveError(move, 'action is not legal in current state');
    }

    try {
      const result = resolveMoveDecisionSequence(def, state, move, {
        choose: () => undefined,
      });
      if (!result.complete) {
        if (result.illegal !== undefined) {
          throw illegalMoveError(move, 'pipeline move is not legal in current state', {
            code: 'OPERATION_NOT_DISPATCHABLE',
            detail: result.illegal.reason,
          });
        }
        throw illegalMoveError(move, 'pipeline move has incomplete params', {
          code: 'OPERATION_INCOMPLETE_PARAMS',
          nextDecisionId: result.nextDecision?.decisionId,
          nextDecisionName: result.nextDecision?.name,
        });
      }
    } catch (err) {
      if (isKernelErrorCode(err, 'LEGAL_CHOICES_VALIDATION_FAILED')) {
        throw illegalMoveError(move, 'pipeline move params are invalid', {
          code: 'OPERATION_INVALID_PARAMS',
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
    return;
  }

  const legal = legalMoves(def, state);
  const matchingActionMoves = legal.filter((candidate) => candidate.actionId === action.id);
  const hasChoices = hasChoiceEffects(action.effects);

  if (!hasChoices) {
    if (legal.some((candidate) => isSameMove(candidate, move))) {
      return;
    }
    if (matchingActionMoves.length > 0) {
      throw illegalMoveError(move, 'params are not legal for this action in current state');
    }
    throw illegalMoveError(move, 'action is not legal in current state');
  }

  if (matchingActionMoves.length === 0 && move.freeOperation !== true) {
    throw illegalMoveError(move, 'action is not legal in current state');
  }

  const declaredParams = pickDeclaredActionParams(action, move.params);
  const hasMatchingDeclaredParams = matchingActionMoves.some(
    (candidate) => areMoveParamsEqual(pickDeclaredActionParams(action, candidate.params), declaredParams),
  );
  if (!hasMatchingDeclaredParams && move.freeOperation !== true) {
    throw illegalMoveError(move, 'params are not legal for this action in current state');
  }

  try {
    const result = resolveMoveDecisionSequence(def, state, move, {
      choose: () => undefined,
    });
    if (result.complete) {
      return;
    }
    if (result.illegal !== undefined) {
      throw illegalMoveError(move, 'move is not legal in current state', {
        code: 'OPERATION_NOT_DISPATCHABLE',
        detail: result.illegal.reason,
      });
    }
    throw illegalMoveError(move, 'move has incomplete params', {
      code: 'OPERATION_INCOMPLETE_PARAMS',
      nextDecisionId: result.nextDecision?.decisionId,
      nextDecisionName: result.nextDecision?.name,
    });
  } catch (err) {
    if (isKernelErrorCode(err, 'LEGAL_CHOICES_VALIDATION_FAILED')) {
      throw illegalMoveError(move, 'move params are invalid', {
        code: 'OPERATION_INVALID_PARAMS',
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

interface ApplyMoveCoreOptions {
  readonly skipValidation?: boolean;
  readonly skipAdvanceToDecisionPoint?: boolean;
}

const applyMoveCore = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: ExecutionOptions,
  coreOptions?: ApplyMoveCoreOptions,
): ApplyMoveResult => {
  if (coreOptions?.skipValidation !== true) {
    validateMove(def, state, move);
  }

  const action = findAction(def, move.actionId);
  if (action === undefined) {
    throw illegalMoveError(move, 'unknown action id');
  }

  const rng: Rng = { state: state.rng };
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const collector = createCollector(options);
  const baseBindings = runtimeBindingsForMove(move, undefined);
  const executionPlayer = move.freeOperation === true
    ? resolveFreeOperationExecutionPlayer(def, state, move)
    : resolveActionExecutorPlayer({
      def,
      state,
      adjacencyGraph,
      action,
      decisionPlayer: state.activePlayer,
      bindings: baseBindings,
    });
  const effectCtxBase = {
    def,
    adjacencyGraph,
    activePlayer: executionPlayer,
    actorPlayer: executionPlayer,
    bindings: baseBindings,
    moveParams: move.params,
    collector,
    ...(def.mapSpaces === undefined ? {} : { mapSpaces: def.mapSpaces }),
  } as const;

  const pipelineDispatch = resolveActionPipelineDispatch(def, action, { ...effectCtxBase, state });
  if (pipelineDispatch.kind === 'configuredNoMatch') {
    throw illegalMoveError(move, 'action is not legal in current state');
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
    bindings: {
      ...runtimeMoveParams,
      __freeOperation: move.freeOperation ?? false,
      __actionClass: move.actionClass ?? 'operation',
    },
    moveParams: runtimeMoveParams,
  } as const;
  const isFreeOp = move.freeOperation === true && executionProfile !== undefined;

  if (move.compound !== undefined) {
    const saMove = move.compound.specialActivity;
    const saPipeline = resolveMatchedPipelineForMove(def, state, saMove);
    if (saPipeline !== undefined && !operationAllowsSpecialActivity(move.actionId, saPipeline.accompanyingOps)) {
      throw illegalMoveError(move, 'special activity cannot accompany this operation', {
        code: 'SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED',
        operationActionId: action.id,
        specialActivityActionId: saMove.actionId,
        profileId: saPipeline.id,
      });
    }
    if (saPipeline !== undefined) {
      const violated = violatesCompoundParamConstraints(move, saMove, saPipeline);
      if (violated !== null) {
        throw illegalMoveError(move, 'special activity violates compound param constraints', {
          code: 'SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED',
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
    executionProfile !== undefined &&
    executionProfile.legality !== null &&
    !evalCondition(executionProfile.legality, { ...effectCtx, state })
  ) {
    throw illegalMoveError(move, 'action pipeline legality predicate failed', {
      code: 'OPERATION_LEGALITY_FAILED',
      profileId: actionPipeline?.id,
      actionId: action.id,
    });
  }

  const costValidationPassed = isFreeOp ||
    (executionProfile?.costValidation === null || executionProfile === undefined
      ? true
      : evalCondition(executionProfile.costValidation, { ...effectCtx, state }));
  if (executionProfile !== undefined && executionProfile.partialMode === 'atomic' && !costValidationPassed) {
    throw illegalMoveError(move, 'action pipeline cost validation failed', {
      code: 'OPERATION_COST_BLOCKED',
      profileId: actionPipeline?.id,
      actionId: action.id,
      partialExecutionMode: executionProfile.partialMode,
    });
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
    const saResult = applyMoveCore(def, effectState, move.compound.specialActivity, options);
    effectState = saResult.state;
    effectRng = { state: effectState.rng };
    executionTraceEntries.push(...saResult.triggerFirings);
    collector.warnings.push(...saResult.warnings);
    if (collector.trace !== null && saResult.effectTrace !== undefined) {
      collector.trace.push(...saResult.effectTrace);
    }
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

  const lastingActivation = executeEventMove(def, effectState, effectRng, move);
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
      adjacencyGraph,
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
    adjacencyGraph,
  );

  const stateWithRng = {
    ...triggerResult.state,
    rng: triggerResult.rng.state,
  };
  const turnFlowResult = move.freeOperation === true
    ? { state: consumeTurnFlowFreeOperationGrant(def, stateWithRng, move), traceEntries: [] as readonly TriggerLogEntry[] }
    : applyTurnFlowEligibilityAfterMove(def, stateWithRng, move);
  const lifecycleAndAdvanceLog: TriggerLogEntry[] = [];
  const progressedState = coreOptions?.skipAdvanceToDecisionPoint === true
    ? turnFlowResult.state
    : advanceToDecisionPoint(def, turnFlowResult.state, lifecycleAndAdvanceLog);

  const stateWithHash = {
    ...progressedState,
    stateHash: computeFullHash(createZobristTable(def), progressedState),
  };

  return {
    state: stateWithHash,
    triggerFirings: [...executionTraceEntries, ...triggerResult.triggerLog, ...turnFlowResult.traceEntries, ...lifecycleAndAdvanceLog],
    warnings: collector.warnings,
    ...(collector.trace !== null ? { effectTrace: collector.trace } : {}),
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
  if (move.compound !== undefined) {
    throw illegalMoveError(move, 'simultaneous submission does not support compound moves');
  }
  if (state.turnOrderState.type !== 'simultaneous') {
    throw illegalMoveError(move, 'simultaneous strategy requires simultaneous runtime state');
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
  const warnings: Array<ApplyMoveResult['warnings'][number]> = [];
  const effectTraceEntries: Array<NonNullable<ApplyMoveResult['effectTrace']>[number]> | undefined =
    options?.trace === true ? [] : undefined;

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
      },
    );
    committedState = applied.state;
    triggerFirings.push(...applied.triggerFirings);
    warnings.push(...applied.warnings);
    if (effectTraceEntries !== undefined && applied.effectTrace !== undefined) {
      effectTraceEntries.push(...applied.effectTrace);
    }
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
  const progressedState = advanceToDecisionPoint(def, resetState, lifecycleAndAdvanceLog);
  const finalState = {
    ...progressedState,
    stateHash: computeFullHash(table, progressedState),
  };

  return {
    state: finalState,
    triggerFirings: [...triggerFirings, ...lifecycleAndAdvanceLog],
    warnings,
    ...(effectTraceEntries === undefined ? {} : { effectTrace: effectTraceEntries }),
  };
};

export const applyMove = (def: GameDef, state: GameState, move: Move, options?: ExecutionOptions): ApplyMoveResult => {
  if (def.turnOrder?.type === 'simultaneous') {
    return applySimultaneousSubmission(def, state, move, options);
  }
  return applyMoveCore(def, state, move, options);
};
