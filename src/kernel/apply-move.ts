import { incrementActionUsage } from './action-usage.js';
import { evalCondition } from './eval-condition.js';
import { applyEffects } from './effects.js';
import { legalMoves } from './legal-moves.js';
import { advanceToDecisionPoint } from './phase-advance.js';
import { buildAdjacencyGraph } from './spatial.js';
import { applyTurnFlowEligibilityAfterMove } from './turn-flow-eligibility.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import type {
  ActionDef,
  ApplyMoveResult,
  ConditionAST,
  EffectAST,
  GameDef,
  GameState,
  Move,
  MoveParamValue,
  OperationProfileDef,
  Rng,
  TriggerLogEntry,
  TriggerEvent,
} from './types.js';
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

const findAction = (def: GameDef, actionId: Move['actionId']): ActionDef | undefined =>
  def.actions.find((action) => action.id === actionId);

interface OperationExecutionProfile {
  readonly legality: ConditionAST | null;
  readonly costValidation: ConditionAST | null;
  readonly costSpend: readonly EffectAST[];
  readonly resolutionStages: readonly (readonly EffectAST[])[];
  readonly partialMode: 'forbid' | 'allow';
}

const resolveOperationProfile = (def: GameDef, action: ActionDef): OperationProfileDef | undefined =>
  def.operationProfiles?.find((profile) => profile.actionId === action.id);

const toOperationExecutionProfile = (action: ActionDef, profile: OperationProfileDef): OperationExecutionProfile => ({
  legality: profile.legality.when ?? null,
  costValidation: profile.cost.validate ?? null,
  costSpend: profile.cost.spend ?? action.cost,
  resolutionStages: profile.resolution.length > 0
    ? profile.resolution.map((stage) => stage.effects)
    : [action.effects],
  partialMode: profile.partialExecution.mode,
});

const illegalMoveError = (
  move: Move,
  reason: string,
  metadata?: Readonly<Record<string, unknown>>,
): Error => {
  const error = new Error(
    `Illegal move: actionId=${String(move.actionId)} reason=${reason} params=${JSON.stringify(move.params)}`,
  );
  Object.assign(error, {
    actionId: move.actionId,
    params: move.params,
    reason,
    ...(metadata === undefined ? {} : { metadata }),
  });
  return error;
};

const validateMove = (def: GameDef, state: GameState, move: Move): void => {
  const action = findAction(def, move.actionId);
  if (action === undefined) {
    throw illegalMoveError(move, 'unknown action id');
  }

  const legal = legalMoves(def, state);
  if (legal.some((candidate) => isSameMove(candidate, move))) {
    return;
  }

  const matchingActionMoves = legal.filter((candidate) => candidate.actionId === action.id);
  if (matchingActionMoves.length > 0) {
    throw illegalMoveError(move, 'params are not legal for this action in current state');
  }

  throw illegalMoveError(move, 'action is not legal in current state');
};

export const applyMove = (def: GameDef, state: GameState, move: Move): ApplyMoveResult => {
  validateMove(def, state, move);

  const action = findAction(def, move.actionId);
  if (action === undefined) {
    throw illegalMoveError(move, 'unknown action id');
  }

  const rng: Rng = { state: state.rng };
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const effectCtxBase = {
    def,
    adjacencyGraph,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    bindings: move.params,
    moveParams: move.params,
  } as const;

  const operationProfile = resolveOperationProfile(def, action);
  const executionProfile = operationProfile === undefined ? undefined : toOperationExecutionProfile(action, operationProfile);
  const isFreeOp = move.freeOperation === true && executionProfile !== undefined;

  if (
    executionProfile !== undefined &&
    executionProfile.legality !== null &&
    !evalCondition(executionProfile.legality, { ...effectCtxBase, state })
  ) {
    throw illegalMoveError(move, 'operation profile legality predicate failed', {
      code: 'OPERATION_LEGALITY_FAILED',
      profileId: operationProfile?.id,
      actionId: action.id,
    });
  }

  const costValidationPassed = isFreeOp ||
    (executionProfile?.costValidation === null || executionProfile === undefined
      ? true
      : evalCondition(executionProfile.costValidation, { ...effectCtxBase, state }));
  if (executionProfile !== undefined && executionProfile.partialMode === 'forbid' && !costValidationPassed) {
    throw illegalMoveError(move, 'operation profile cost validation failed', {
      code: 'OPERATION_COST_BLOCKED',
      profileId: operationProfile?.id,
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
      ...effectCtxBase,
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
  } else if (executionProfile !== undefined && executionProfile.partialMode === 'allow' && !costValidationPassed) {
    executionTraceEntries.push({
      kind: 'operationPartial',
      actionId: action.id,
      profileId: operationProfile?.id ?? 'unknown',
      step: 'costSpendSkipped',
      reason: 'costValidationFailed',
    });
  }

  const applyCompoundSA = (): void => {
    if (move.compound === undefined) return;
    const saResult = applyMove(def, effectState, move.compound.specialActivity);
    effectState = saResult.state;
    effectRng = { state: effectState.rng };
    executionTraceEntries.push(...saResult.triggerFirings);
  };

  if (move.compound?.timing === 'before') {
    applyCompoundSA();
  }

  if (executionProfile === undefined) {
    const effectResult = applyEffects(action.effects, {
      ...effectCtxBase,
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
        ...effectCtxBase,
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
  const turnFlowResult = isFreeOp
    ? { state: stateWithRng, traceEntries: [] as readonly TriggerLogEntry[] }
    : applyTurnFlowEligibilityAfterMove(def, stateWithRng, move);
  const lifecycleAndAdvanceLog: TriggerLogEntry[] = [];
  const progressedState = advanceToDecisionPoint(def, turnFlowResult.state, lifecycleAndAdvanceLog);

  const stateWithHash = {
    ...progressedState,
    stateHash: computeFullHash(createZobristTable(def), progressedState),
  };

  return {
    state: stateWithHash,
    triggerFirings: [...executionTraceEntries, ...triggerResult.triggerLog, ...turnFlowResult.traceEntries, ...lifecycleAndAdvanceLog],
  };
};
