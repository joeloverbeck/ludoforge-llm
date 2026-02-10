import { incrementActionUsage } from './action-usage.js';
import { applyEffects } from './effects.js';
import { legalMoves } from './legal-moves.js';
import { advanceToDecisionPoint } from './phase-advance.js';
import { buildAdjacencyGraph } from './spatial.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import type { ActionDef, ApplyMoveResult, GameDef, GameState, Move, MoveParamValue, Rng } from './types.js';
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

const illegalMoveError = (move: Move, reason: string): Error => {
  const error = new Error(
    `Illegal move: actionId=${String(move.actionId)} reason=${reason} params=${JSON.stringify(move.params)}`,
  );
  Object.assign(error, {
    actionId: move.actionId,
    params: move.params,
    reason,
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
    bindings: {},
    moveParams: move.params,
  } as const;

  const costResult = applyEffects(action.cost, {
    ...effectCtxBase,
    state,
    rng,
  });

  const effectResult = applyEffects(action.effects, {
    ...effectCtxBase,
    state: costResult.state,
    rng: costResult.rng,
  });

  const stateWithUsage = incrementActionUsage(effectResult.state, action.id);
  const maxDepth = def.metadata.maxTriggerDepth ?? DEFAULT_MAX_TRIGGER_DEPTH;
  let triggerState = stateWithUsage;
  let triggerRng = effectResult.rng;
  let triggerLog = [] as ApplyMoveResult['triggerFirings'];

  for (const emittedEvent of effectResult.emittedEvents ?? []) {
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
  const progressedState = advanceToDecisionPoint(def, stateWithRng);

  const stateWithHash = {
    ...progressedState,
    stateHash: computeFullHash(createZobristTable(def), progressedState),
  };

  return {
    state: stateWithHash,
    triggerFirings: triggerResult.triggerLog,
  };
};
