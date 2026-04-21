import { asPlayerId, type SeatId } from '../branded.js';
import { createGameDefRuntime, type GameDefRuntime } from '../gamedef-runtime.js';
import type { DecisionKey } from '../decision-scope.js';
import { enumerateLegalMoves } from '../legal-moves.js';
import { derivePlayerObservation } from '../observation.js';
import type {
  ChoicePendingRequest,
  GameDef,
  GameState,
  Move,
} from '../types-core.js';
import { computeFullHash, createZobristTable } from '../zobrist.js';
import { resolveDecisionContinuation, type DecisionContinuationResult } from './continuation.js';
import {
  asDecisionFrameId,
  asTurnId,
  resolveActiveDeciderSeatIdForPlayer,
  type ActionSelectionContext,
  type ActionSelectionDecision,
  type ChooseNStepContext,
  type ChooseNStepDecision,
  type ChooseOneContext,
  type ChooseOneDecision,
  type CompoundTurnTraceEntry,
  type DecisionStackFrame,
  type EffectExecutionFrameSnapshot,
  type MicroturnState,
  type StochasticDistribution,
  type StochasticResolveContext,
  type StochasticResolveDecision,
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

const isSupportedChoiceRequest = (request: ChoicePendingRequest): boolean =>
  request.type === 'chooseOne' || request.type === 'chooseN';

const toStochasticDistribution = (
  continuation: DecisionContinuationResult,
): { readonly decisionKey: DecisionKey; readonly distribution: StochasticDistribution } | null => {
  const stochasticDecision = continuation.stochasticDecision;
  if (stochasticDecision === undefined) {
    return null;
  }

  const decisionKeys = new Set(
    stochasticDecision.outcomes.flatMap((outcome) => Object.keys(outcome.bindings)),
  );
  if (decisionKeys.size !== 1) {
    return null;
  }

  const decisionKey = [...decisionKeys][0]!;
  const outcomes = stochasticDecision.outcomes
    .map((outcome) => outcome.bindings[decisionKey])
    .filter((value): value is string | number | boolean => value !== undefined)
    .map((value) => ({ value, weight: 1 }));
  if (outcomes.length === 0) {
    return null;
  }

  return {
    decisionKey: decisionKey as unknown as DecisionKey,
    distribution: { outcomes },
  };
};

const resolveContinuationForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
): DecisionContinuationResult =>
  resolveDecisionContinuation(
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
  if (continuation.illegal !== undefined) {
    return false;
  }
  if (continuation.stochasticDecision !== undefined) {
    return toStochasticDistribution(continuation) !== null;
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
    switch (entry.decision.kind) {
      case 'chooseOne':
        return {
          ...move,
          params: {
            ...move.params,
            [entry.decision.decisionKey]: entry.decision.value,
          },
        };
      case 'chooseNStep':
        if (entry.decision.command !== 'confirm' || entry.decision.value === undefined) {
          return move;
        }
        return {
          ...move,
          params: {
            ...move.params,
            [entry.decision.decisionKey]: entry.decision.value,
          },
        };
      case 'stochasticResolve':
        return {
          ...move,
          params: {
            ...move.params,
            [entry.decision.decisionKey]: entry.decision.value,
          },
        };
      default:
        return move;
    }
  }, selectedMove);
};

export const rebuildMoveFromFrame = (frame: DecisionStackFrame): Move => ({
  ...rebuildMoveFromTrace(rootDecisionHistory(frame)),
  params: {
    ...rebuildMoveFromTrace(rootDecisionHistory(frame)).params,
    ...frame.accumulatedBindings,
  },
});

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

const toChooseNStepContext = (
  request: ChoicePendingRequest & { readonly type: 'chooseN' },
  seatId: SeatId,
): ChooseNStepContext => ({
  kind: 'chooseNStep',
  seatId,
  decisionKey: request.decisionKey,
  options: request.options,
  selectedSoFar: request.selected,
  cardinality: {
    min: request.min ?? 0,
    max: request.max ?? request.options.length,
  },
  stepCommands: request.canConfirm ? ['add', 'remove', 'confirm'] : ['add', 'remove'],
});

const toChooseNStepDecisions = (
  context: ChooseNStepContext,
): readonly ChooseNStepDecision[] => {
  const selectedKeys = new Set(context.selectedSoFar.map((value) => JSON.stringify([typeof value, value])));
  const additions = context.options
    .filter((option) => option.legality !== 'illegal')
    .filter((option) => !Array.isArray(option.value))
    .filter((option) => !selectedKeys.has(JSON.stringify([typeof option.value, option.value])))
    .map<ChooseNStepDecision>((option) => ({
      kind: 'chooseNStep',
      decisionKey: context.decisionKey,
      command: 'add',
      value: option.value as string | number | boolean,
    }));
  const removals = context.selectedSoFar.map<ChooseNStepDecision>((value) => ({
    kind: 'chooseNStep',
    decisionKey: context.decisionKey,
    command: 'remove',
    value,
  }));
  return context.stepCommands.includes('confirm')
    ? [...additions, ...removals, {
      kind: 'chooseNStep',
      decisionKey: context.decisionKey,
      command: 'confirm',
    }]
    : [...additions, ...removals];
};

const toStochasticResolveContext = (
  decisionKey: DecisionKey,
  distribution: StochasticDistribution,
): StochasticResolveContext => ({
  kind: 'stochasticResolve',
  seatId: '__chance',
  decisionKey,
  distribution,
});

const toStochasticResolveDecisions = (
  context: StochasticResolveContext,
): readonly StochasticResolveDecision[] =>
  context.distribution.outcomes.map((outcome) => ({
    kind: 'stochasticResolve',
    decisionKey: context.decisionKey,
    value: outcome.value,
  }));

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
    const baseMove = rebuildMoveFromFrame(root);
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
        if (continuation.illegal !== undefined) {
          return false;
        }
        return continuation.stochasticDecision !== undefined
          ? toStochasticDistribution(continuation) !== null
          : continuation.nextDecision === undefined || isSupportedChoiceRequest(continuation.nextDecision);
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
  if (top.context.kind === 'chooseNStep') {
    const context = top.context;
    return {
      kind: 'chooseNStep',
      seatId,
      decisionContext: context,
      legalActions: toChooseNStepDecisions(context),
      projectedState: buildProjectedState(def, state, seatId),
      turnId: top.turnId,
      frameId: top.frameId,
      compoundTurnTrace,
    };
  }
  if (top.context.kind === 'stochasticResolve') {
    const context = top.context;
    return {
      kind: 'stochasticResolve',
      seatId,
      decisionContext: context,
      legalActions: toStochasticResolveDecisions(context),
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

export const toDecisionStackContext = (
  request: ChoicePendingRequest,
  seatId: SeatId,
): ChooseOneContext | ChooseNStepContext =>
  request.type === 'chooseOne'
    ? toChooseOneContext(request, seatId)
    : toChooseNStepContext(request, seatId);

export const toStochasticDecisionStackContext = (
  continuation: DecisionContinuationResult,
): StochasticResolveContext => {
  const stochastic = toStochasticDistribution(continuation);
  if (stochastic === null) {
    throw new Error('UNSUPPORTED_CONTEXT_KIND_THIS_TICKET: stochastic continuation does not expose a single-bind distribution');
  }
  return toStochasticResolveContext(stochastic.decisionKey, stochastic.distribution);
};
