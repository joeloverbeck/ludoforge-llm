import type { GameDefRuntime } from '../gamedef-runtime.js';
import type { GameDef, GameState, ProbeHoleRecoveryLog } from '../types-core.js';
import { computeFullHash, createZobristTable } from '../zobrist.js';
import { asDecisionFrameId, type ActiveDeciderSeatId, type DecisionStackFrame } from './types.js';
import { rebuildMoveFromFrame } from './publish.js';

export interface RollbackResult {
  readonly state: GameState;
  readonly logEntry: ProbeHoleRecoveryLog;
}

export const unavailableActionKeyForTurnSeat = (
  turnId: DecisionStackFrame['turnId'],
  seatId: ActiveDeciderSeatId,
): string => `${String(turnId)}:${String(seatId)}`;

const withResolvedHash = (
  def: GameDef,
  state: GameState,
  runtime: GameDefRuntime,
): GameState => {
  const table = runtime.zobristTable ?? createZobristTable(def);
  const stateHash = computeFullHash(table, state);
  return {
    ...state,
    stateHash,
    _runningHash: stateHash,
  };
};

const appendUnavailableAction = (
  state: GameState,
  frame: DecisionStackFrame,
): NonNullable<GameState['unavailableActionsPerTurn']> => {
  const seatId = frame.context.seatId;
  if (seatId === '__chance' || seatId === '__kernel') {
    throw new Error(`MICROTURN_ROLLBACK_ACTION_SELECTION_SEAT_UNSUPPORTED:${seatId}`);
  }
  const key = unavailableActionKeyForTurnSeat(frame.turnId, seatId);
  const existing = state.unavailableActionsPerTurn ?? {};
  const existingActions = existing[key] ?? [];
  const actionId = rebuildMoveFromFrame(frame).actionId;
  return {
    ...existing,
    [key]: existingActions.includes(actionId) ? existingActions : [...existingActions, actionId],
  };
};

const isActionAlreadyUnavailable = (
  state: GameState,
  frame: DecisionStackFrame,
): boolean => {
  const seatId = frame.context.seatId;
  if (seatId === '__chance' || seatId === '__kernel') {
    return true;
  }
  const key = unavailableActionKeyForTurnSeat(frame.turnId, seatId);
  return (state.unavailableActionsPerTurn?.[key] ?? []).includes(rebuildMoveFromFrame(frame).actionId);
};

export const rollbackToActionSelection = (
  def: GameDef,
  state: GameState,
  runtime: GameDefRuntime,
  invariantMessage: string,
): RollbackResult | null => {
  const canonicalState = withResolvedHash(def, state, runtime);
  const stack = canonicalState.decisionStack ?? [];
  let actionSelectionIndex = -1;
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index]?.context.kind === 'actionSelection') {
      actionSelectionIndex = index;
      break;
    }
  }
  if (actionSelectionIndex < 0) {
    return null;
  }

  const actionSelectionFrame = stack[actionSelectionIndex]!;
  const seatId = actionSelectionFrame.context.seatId;
  if (seatId === '__chance' || seatId === '__kernel') {
    return null;
  }
  if (isActionAlreadyUnavailable(canonicalState, actionSelectionFrame)) {
    return null;
  }
  const newStack = stack.slice(0, actionSelectionIndex + 1);
  const nextFrameId = asDecisionFrameId(
    Math.max(...newStack.map((frame) => Number(frame.frameId))) + 1,
  );
  const nextState = withResolvedHash(def, {
    ...canonicalState,
    decisionStack: newStack,
    unavailableActionsPerTurn: appendUnavailableAction(canonicalState, actionSelectionFrame),
    nextFrameId,
    activeDeciderSeatId: seatId,
  }, runtime);

  return {
    state: nextState,
    logEntry: {
      kind: 'probeHoleRecovery',
      stateHashBefore: canonicalState.stateHash,
      stateHashAfter: nextState.stateHash,
      seatId,
      turnId: actionSelectionFrame.turnId,
      blacklistedActionId: rebuildMoveFromFrame(actionSelectionFrame).actionId,
      rolledBackFrames: stack.length - newStack.length,
      reason: invariantMessage,
    },
  };
};
