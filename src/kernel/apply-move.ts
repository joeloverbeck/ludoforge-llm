import { incrementActionUsage } from './action-usage.js';
import { evalCondition } from './eval-condition.js';
import { applyEffects } from './effects.js';
import { createCollector } from './execution-collector.js';
import { legalChoices } from './legal-choices.js';
import { legalMoves } from './legal-moves.js';
import { resolveActionPipeline, toExecutionPipeline } from './apply-move-pipeline.js';
import { advanceToDecisionPoint } from './phase-advance.js';
import { buildAdjacencyGraph } from './spatial.js';
import { applyTurnFlowEligibilityAfterMove } from './turn-flow-eligibility.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import type {
  ActionDef,
  ApplyMoveResult,
  ExecutionOptions,
  GameDef,
  GameState,
  Move,
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

const findAction = (def: GameDef, actionId: Move['actionId']): ActionDef | undefined =>
  def.actions.find((action) => action.id === actionId);

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

  const hasPipeline = (def.actionPipelines ?? []).some((pipeline) => pipeline.actionId === action.id);

  if (hasPipeline) {
    const legal = legalMoves(def, state);
    const hasTemplate = legal.some((candidate) => candidate.actionId === action.id);
    if (!hasTemplate && move.freeOperation !== true) {
      throw illegalMoveError(move, 'action is not legal in current state');
    }

    try {
      const result = legalChoices(def, state, move);
      if (!result.complete) {
        throw illegalMoveError(move, 'pipeline move has incomplete params', {
          code: 'OPERATION_INCOMPLETE_PARAMS',
          nextDecision: result.name,
        });
      }
    } catch (err) {
      if (err instanceof Error && 'reason' in err) {
        throw err;
      }
      if (err instanceof Error && err.message.startsWith('legalChoices:')) {
        throw illegalMoveError(move, 'pipeline move params are invalid', {
          code: 'OPERATION_INVALID_PARAMS',
          detail: err.message,
        });
      }
      throw err;
    }
    return;
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
  const effectCtxBase = {
    def,
    adjacencyGraph,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    bindings: { ...move.params, __freeOperation: move.freeOperation ?? false, __actionClass: move.actionClass ?? 'operation' },
    moveParams: move.params,
    collector,
  } as const;

  const actionPipeline = resolveActionPipeline(def, action, { ...effectCtxBase, state });
  const executionProfile = actionPipeline === undefined ? undefined : toExecutionPipeline(action, actionPipeline);
  const isFreeOp = move.freeOperation === true && executionProfile !== undefined;

  if (
    executionProfile !== undefined &&
    executionProfile.legality !== null &&
    !evalCondition(executionProfile.legality, { ...effectCtxBase, state })
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
      : evalCondition(executionProfile.costValidation, { ...effectCtxBase, state }));
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
