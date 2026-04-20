import { asPlayerId, type SeatId } from '../branded.js';
import { createGameDefRuntime, type GameDefRuntime } from '../gamedef-runtime.js';
import { enumerateLegalMoves } from '../legal-moves.js';
import { resolveMoveDecisionSequence } from '../move-decision-sequence.js';
import { derivePlayerObservation } from '../observation.js';
import type {
  ChoicePendingRequest,
  GameDef,
  GameState,
  Move,
} from '../types-core.js';
import { computeFullHash, createZobristTable } from '../zobrist.js';
import {
  asDecisionFrameId,
  asTurnId,
  resolveActiveDeciderSeatIdForPlayer,
  type ActionSelectionContext,
  type ActionSelectionDecision,
  type ChooseOneContext,
  type ChooseOneDecision,
  type CompoundTurnTraceEntry,
  type DecisionStackFrame,
  type EffectExecutionFrameSnapshot,
  type MicroturnState,
  type TurnRetirementContext,
  type TurnRetirementDecision,
} from './types.js';

export const UNSUPPORTED_CONTEXT_KIND_THIS_TICKET = 'UNSUPPORTED_CONTEXT_KIND_THIS_TICKET';
export const UNSUPPORTED_AUTO_RESOLVE_THIS_TICKET = 'UNSUPPORTED_AUTO_RESOLVE_THIS_TICKET';

export const getRuntime = (def: GameDef, runtime?: GameDefRuntime): GameDefRuntime =>
  runtime ?? createGameDefRuntime(def);

const withComputedHash = (def: GameDef, state: GameState, runtime?: GameDefRuntime): GameState => {
  const table = runtime?.zobristTable ?? createZobristTable(def);
  const hash = computeFullHash(table, state);
  return {
    ...state,
    _runningHash: hash,
    stateHash: hash,
  };
};

export const withResolvedHash = withComputedHash;

const activeSeatForPlayer = (def: GameDef, state: GameState): SeatId =>
  resolveActiveDeciderSeatIdForPlayer(def, Number(state.activePlayer));

const actionSelectionTurnId = (state: GameState): ReturnType<typeof asTurnId> =>
  state.nextTurnId ?? asTurnId(0);

const actionSelectionFrameId = (state: GameState): ReturnType<typeof asDecisionFrameId> =>
  state.nextFrameId ?? asDecisionFrameId(0);

const isSupportedChoiceRequest = (request: ChoicePendingRequest): request is ChoicePendingRequest & { readonly type: 'chooseOne' } =>
  request.type === 'chooseOne';

const resolveContinuationForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
): ReturnType<typeof resolveMoveDecisionSequence> =>
  resolveMoveDecisionSequence(
    def,
    state,
    move,
    { choose: () => undefined },
    runtime,
  );

const isSupportedActionMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
): boolean => {
  const continuation = resolveContinuationForMove(def, state, move, runtime);
  if (continuation.illegal !== undefined || continuation.stochasticDecision !== undefined || continuation.nextDecisionSet !== undefined) {
    return false;
  }
  if (continuation.nextDecision === undefined) {
    return continuation.complete;
  }
  return isSupportedChoiceRequest(continuation.nextDecision);
};

const supportedActionMovesForState = (
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
): readonly Move[] =>
  enumerateLegalMoves(
    def,
    state,
    { probePlainActionFeasibility: true },
    runtime,
  ).moves
    .map((entry) => entry.move)
    .filter((move) => isSupportedActionMove(def, state, move, runtime));

const rootDecisionHistory = (frame: DecisionStackFrame): readonly CompoundTurnTraceEntry[] =>
  frame.effectFrame.decisionHistory ?? [];

export const rebuildMoveFromTrace = (trace: readonly CompoundTurnTraceEntry[]): Move => {
  const root = trace[0];
  if (root?.decision.kind !== 'actionSelection') {
    throw new Error('rebuildMoveFromTrace requires an actionSelection root decision');
  }
  const selectedMove = root.decision.move ?? { actionId: root.decision.actionId, params: {} };
  return trace.slice(1).reduce<Move>((move, entry) => {
    if (entry.decision.kind !== 'chooseOne') {
      return move;
    }
    return {
      ...move,
      params: {
        ...move.params,
        [entry.decision.decisionKey]: entry.decision.value,
      },
    };
  }, selectedMove);
};

const buildProjectedState = (
  def: GameDef,
  state: GameState,
  seatId: SeatId | '__chance' | '__kernel',
): MicroturnState['projectedState'] => {
  if (seatId === '__chance' || seatId === '__kernel') {
    return { state };
  }
  const seats = def.seats ?? [];
  const playerIndex = seats.findIndex((seat) => seat.id === seatId);
  if (playerIndex < 0) {
    return { state };
  }
  return {
    state,
    observation: derivePlayerObservation(def, state, asPlayerId(playerIndex)),
  };
};

const toActionSelectionDecisions = (
  supportedMoves: readonly Move[],
): readonly ActionSelectionDecision[] =>
  supportedMoves.map((move) => ({
    kind: 'actionSelection',
    actionId: move.actionId,
    move,
  }));

const toTurnRetirementDecision = (
  context: TurnRetirementContext,
): readonly TurnRetirementDecision[] => [{
  kind: 'turnRetirement',
  retiringTurnId: context.retiringTurnId,
}];

const toChooseOneContext = (
  request: ChoicePendingRequest & { readonly type: 'chooseOne' },
  seatId: SeatId,
): ChooseOneContext => ({
  kind: 'chooseOne',
  seatId,
  decisionKey: request.decisionKey,
  options: request.options,
});

const findRootFrame = (state: GameState, top: DecisionStackFrame): DecisionStackFrame => {
  const frames = state.decisionStack ?? [];
  let current: DecisionStackFrame = top;
  while (current.parentFrameId !== null) {
    const parent = frames.find((frame) => frame.frameId === current.parentFrameId);
    if (parent === undefined) {
      break;
    }
    current = parent;
  }
  return current;
};

const publishedSeatId = (
  state: GameState,
  fallbackSeatId: SeatId,
): SeatId =>
  state.activeDeciderSeatId === undefined
  || state.activeDeciderSeatId === '__chance'
  || state.activeDeciderSeatId === '__kernel'
    ? fallbackSeatId
    : state.activeDeciderSeatId;

const publishActionSelection = (
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
): MicroturnState => {
  const supportedMoves = supportedActionMovesForState(def, state, runtime);
  if (supportedMoves.length === 0) {
    throw new Error(`${UNSUPPORTED_CONTEXT_KIND_THIS_TICKET}: no simple actionSelection moves are currently bridgeable`);
  }
  const seatId = publishedSeatId(state, activeSeatForPlayer(def, state));
  const decisionContext: ActionSelectionContext = {
    kind: 'actionSelection',
    seatId,
    eligibleActions: Array.from(new Set(supportedMoves.map((move) => move.actionId))),
  };
  return {
    kind: decisionContext.kind,
    seatId,
    decisionContext,
    legalActions: toActionSelectionDecisions(supportedMoves),
    projectedState: buildProjectedState(def, state, seatId),
    turnId: actionSelectionTurnId(state),
    frameId: actionSelectionFrameId(state),
    compoundTurnTrace: [],
  };
};

const publishStackTop = (
  def: GameDef,
  state: GameState,
  top: DecisionStackFrame,
  runtime?: GameDefRuntime,
): MicroturnState => {
  const seatId = top.context.seatId;
  const root = findRootFrame(state, top);
  const compoundTurnTrace = rootDecisionHistory(root);
  if (top.context.kind === 'actionSelection') {
    const context = top.context;
    const legalActions = toActionSelectionDecisions(
      supportedActionMovesForState(def, state, runtime).filter((move) =>
        context.eligibleActions.includes(move.actionId),
      ),
    );
    if (legalActions.length === 0) {
      throw new Error(`${UNSUPPORTED_CONTEXT_KIND_THIS_TICKET}: actionSelection context has no bridgeable continuations`);
    }
    return {
      kind: 'actionSelection',
      seatId,
      decisionContext: context,
      legalActions,
      projectedState: buildProjectedState(def, state, seatId),
      turnId: top.turnId,
      frameId: top.frameId,
      compoundTurnTrace,
    };
  }
  if (top.context.kind === 'chooseOne') {
    const context = top.context;
    const baseMove = rebuildMoveFromTrace(compoundTurnTrace);
    const legalActions = context.options
      .filter((option) => option.legality !== 'illegal')
      .filter((option) => {
        const continuation = resolveContinuationForMove(def, state, {
          ...baseMove,
          params: {
            ...baseMove.params,
            [context.decisionKey]: option.value,
          },
        }, runtime);
        if (continuation.illegal !== undefined || continuation.stochasticDecision !== undefined || continuation.nextDecisionSet !== undefined) {
          return false;
        }
        return continuation.nextDecision === undefined || isSupportedChoiceRequest(continuation.nextDecision);
      })
      .map<ChooseOneDecision>((option) => ({
        kind: 'chooseOne',
        decisionKey: context.decisionKey,
        value: option.value,
      }));
    if (legalActions.length === 0) {
      throw new Error(`${UNSUPPORTED_CONTEXT_KIND_THIS_TICKET}: chooseOne context has no bridgeable continuations`);
    }
    return {
      kind: 'chooseOne',
      seatId,
      decisionContext: context,
      legalActions,
      projectedState: buildProjectedState(def, state, seatId),
      turnId: top.turnId,
      frameId: top.frameId,
      compoundTurnTrace,
    };
  }
  if (top.context.kind === 'turnRetirement') {
    const context = top.context;
    return {
      kind: 'turnRetirement',
      seatId,
      decisionContext: context,
      legalActions: toTurnRetirementDecision(context),
      projectedState: buildProjectedState(def, state, seatId),
      turnId: top.turnId,
      frameId: top.frameId,
      compoundTurnTrace,
    };
  }
  throw new Error(`${UNSUPPORTED_CONTEXT_KIND_THIS_TICKET}: ${top.context.kind}`);
};

export const publishMicroturn = (
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
): MicroturnState => {
  const top = state.decisionStack?.at(-1);
  if (top === undefined) {
    return publishActionSelection(def, withComputedHash(def, state, runtime), runtime);
  }
  return publishStackTop(def, withComputedHash(def, state, runtime), top, runtime);
};

export const createRootFrameSnapshot = (
  decisionHistory: readonly CompoundTurnTraceEntry[],
): EffectExecutionFrameSnapshot => ({
  programCounter: 0,
  boundedIterationCursors: {},
  localBindings: {},
  pendingTriggerQueue: [],
  decisionHistory,
});

export const createChooseOneFrame = (
  frameId: number,
  parentFrameId: number,
  turnId: number,
  request: ChoicePendingRequest & { readonly type: 'chooseOne' },
  seatId: SeatId,
  history: readonly CompoundTurnTraceEntry[],
): DecisionStackFrame => ({
  frameId: asDecisionFrameId(frameId),
  parentFrameId: asDecisionFrameId(parentFrameId),
  turnId: asTurnId(turnId),
  context: toChooseOneContext(request, seatId),
  accumulatedBindings: {},
  effectFrame: createRootFrameSnapshot(history),
});
