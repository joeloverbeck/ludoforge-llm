import { asDecisionFrameId, asTurnId, resolveActiveDeciderSeatIdForPlayer, type ApplyDecisionResult, type CompoundTurnTraceEntry, type Decision, type DecisionLog, type DecisionStackFrame } from './types.js';
import { applyMove } from '../apply-move.js';
import { advancePhase, buildAdvancePhaseRequest } from '../phase-advance.js';
import { createEvalRuntimeResources } from '../eval-context.js';
import { createGameDefRuntime, type GameDefRuntime } from '../gamedef-runtime.js';
import { resolveMoveDecisionSequence } from '../move-decision-sequence.js';
import type { DecisionKey } from '../decision-scope.js';
import type { ExecutionOptions, GameDef, GameState, Move, TriggerLogEntry } from '../types-core.js';
import { computeFullHash, createZobristTable } from '../zobrist.js';
import { publishMicroturn, rebuildMoveFromTrace, withResolvedHash } from './publish.js';

const rootHistory = (frame: DecisionStackFrame): readonly CompoundTurnTraceEntry[] =>
  frame.effectFrame.decisionHistory ?? [];

const rootFrameFor = (state: GameState): DecisionStackFrame | undefined => {
  const top = state.decisionStack?.at(-1);
  if (top === undefined) {
    return undefined;
  }
  let current: DecisionStackFrame = top;
  while (current.parentFrameId !== null) {
    const parent = state.decisionStack?.find((candidate) => candidate.frameId === current.parentFrameId);
    if (parent === undefined) {
      break;
    }
    current = parent;
  }
  return current;
};

const updateHash = (def: GameDef, state: GameState, runtime?: GameDefRuntime): GameState => {
  const table = runtime?.zobristTable ?? createZobristTable(def);
  const hash = computeFullHash(table, state);
  return {
    ...state,
    stateHash: hash,
    _runningHash: hash,
  };
};

const clearMicroturnState = (
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
): GameState => updateHash(def, {
  ...state,
  decisionStack: [],
  activeDeciderSeatId: resolveActiveDeciderSeatIdForPlayer(def, Number(state.activePlayer)),
}, runtime);

const decisionContextKey = (microturn: ReturnType<typeof publishMicroturn>): DecisionKey | null => {
  switch (microturn.decisionContext.kind) {
    case 'chooseOne':
    case 'chooseNStep':
    case 'stochasticResolve':
      return microturn.decisionContext.decisionKey;
    default:
      return null;
  }
};

const pendingSeatId = (
  def: GameDef,
  state: GameState,
  fallbackSeatId: ReturnType<typeof publishMicroturn>['seatId'],
  decisionPlayer?: GameState['activePlayer'],
): ReturnType<typeof resolveActiveDeciderSeatIdForPlayer> =>
  decisionPlayer === undefined
    ? (fallbackSeatId === '__chance' || fallbackSeatId === '__kernel'
      ? resolveActiveDeciderSeatIdForPlayer(def, Number(state.activePlayer))
      : fallbackSeatId)
    : resolveActiveDeciderSeatIdForPlayer(def, Number(decisionPlayer));

const optionalLogExtras = (
  result: Pick<ApplyDecisionResult, 'effectTrace' | 'conditionTrace' | 'decisionTrace' | 'selectorTrace'>,
): Partial<Pick<DecisionLog, 'effectTrace' | 'conditionTrace' | 'decisionTrace' | 'selectorTrace'>> => ({
  ...(result.effectTrace === undefined ? {} : { effectTrace: result.effectTrace }),
  ...(result.conditionTrace === undefined ? {} : { conditionTrace: result.conditionTrace }),
  ...(result.decisionTrace === undefined ? {} : { decisionTrace: result.decisionTrace }),
  ...(result.selectorTrace === undefined ? {} : { selectorTrace: result.selectorTrace }),
});

const createDecisionLog = (
  state: GameState,
  microturn: ReturnType<typeof publishMicroturn>,
  decision: Decision,
  turnRetired: boolean,
  triggerFirings: ApplyDecisionResult['triggerFirings'],
  warnings: ApplyDecisionResult['warnings'],
  extras?: Partial<Omit<DecisionLog, 'stateHash' | 'seatId' | 'decisionContextKind' | 'decisionKey' | 'decision' | 'turnId' | 'turnRetired' | 'legalActionCount' | 'triggerFirings' | 'warnings' | 'deltas'>>,
): DecisionLog => ({
  stateHash: state.stateHash,
  seatId: microturn.seatId,
  decisionContextKind: microturn.kind,
  decisionKey: decisionContextKey(microturn),
  decision,
  turnId: microturn.turnId,
  turnRetired,
  legalActionCount: microturn.legalActions.length,
  deltas: [],
  triggerFirings,
  warnings,
  ...extras,
});

const isMatchingDecision = (candidate: Decision, decision: Decision): boolean => {
  if (candidate.kind !== decision.kind) {
    return false;
  }
  if (candidate.kind === 'actionSelection' && decision.kind === 'actionSelection') {
    return candidate.actionId === decision.actionId
      && JSON.stringify(candidate.move ?? null) === JSON.stringify(decision.move ?? null);
  }
  if (candidate.kind === 'chooseOne' && decision.kind === 'chooseOne') {
    return candidate.decisionKey === decision.decisionKey
      && JSON.stringify(candidate.value) === JSON.stringify(decision.value);
  }
  if (candidate.kind === 'turnRetirement' && decision.kind === 'turnRetirement') {
    return candidate.retiringTurnId === decision.retiringTurnId;
  }
  return false;
};

const ensurePublishedDecision = (
  def: GameDef,
  state: GameState,
  decision: Decision,
  runtime?: GameDefRuntime,
): ReturnType<typeof publishMicroturn> => {
  const microturn = publishMicroturn(def, state, runtime);
  if (!microturn.legalActions.some((candidate) => isMatchingDecision(candidate, decision))) {
    throw new Error(`MICROTURN_DECISION_NOT_PUBLISHED:${decision.kind}`);
  }
  return microturn;
};

const appendTraceEntry = (
  frame: DecisionStackFrame,
  entry: CompoundTurnTraceEntry,
): DecisionStackFrame => ({
  ...frame,
  effectFrame: {
    ...frame.effectFrame,
    decisionHistory: [...rootHistory(frame), entry],
  },
});

const entryForDecision = (
  microturn: ReturnType<typeof publishMicroturn>,
  decision: Decision,
): CompoundTurnTraceEntry => ({
  seatId: microturn.seatId,
  decisionContextKind: microturn.kind,
  decisionKey: decisionContextKey(microturn),
  decision,
  frameId: microturn.frameId,
});

const applyChosenMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  microturn: ReturnType<typeof publishMicroturn>,
  decision: Decision,
  options?: ExecutionOptions,
  runtime?: GameDefRuntime,
): ApplyDecisionResult => {
  const baseState = clearMicroturnState(def, state, runtime);
  const applied = applyMove(def, baseState, move, options, runtime);
  const triggerFirings = [...applied.triggerFirings];
  const advanced = advancePhase(buildAdvancePhaseRequest(def, applied.state, createEvalRuntimeResources(), {
    cachedRuntime: runtime,
    triggerLogCollector: triggerFirings,
  }));
  const nextState = updateHash(def, {
    ...advanced,
    activeDeciderSeatId: resolveActiveDeciderSeatIdForPlayer(def, Number(advanced.activePlayer)),
    decisionStack: [],
    nextTurnId: asTurnId((state.nextTurnId ?? asTurnId(0)) + 1),
  }, runtime);
  return {
    state: nextState,
    log: createDecisionLog(nextState, microturn, decision, true, triggerFirings, applied.warnings, optionalLogExtras(applied)),
    triggerFirings,
    warnings: applied.warnings,
    ...optionalLogExtras(applied),
  };
};

export const applyDecision = (
  def: GameDef,
  state: GameState,
  decision: Decision,
  options?: ExecutionOptions,
  runtime?: GameDefRuntime,
): ApplyDecisionResult => {
  const resolvedRuntime = runtime ?? createGameDefRuntime(def);
  const canonicalState = withResolvedHash(def, state, resolvedRuntime);
  const microturn = ensurePublishedDecision(def, canonicalState, decision, resolvedRuntime);

  if (decision.kind === 'actionSelection') {
    const move = decision.move ?? { actionId: decision.actionId, params: {} };
    const continuation = resolveMoveDecisionSequence(def, canonicalState, move, { choose: () => undefined }, resolvedRuntime);
    if (continuation.illegal !== undefined || continuation.stochasticDecision !== undefined || continuation.nextDecisionSet !== undefined) {
      throw new Error(`UNSUPPORTED_CONTEXT_KIND_THIS_TICKET:${decision.kind}`);
    }
    if (continuation.nextDecision === undefined) {
      return applyChosenMove(def, canonicalState, continuation.move, microturn, decision, options, resolvedRuntime);
    }
    if (continuation.nextDecision.type !== 'chooseOne') {
      throw new Error(`UNSUPPORTED_CONTEXT_KIND_THIS_TICKET:${continuation.nextDecision.type}`);
    }
    const rootFrameId = canonicalState.nextFrameId ?? asDecisionFrameId(0);
    const childFrameId = asDecisionFrameId(rootFrameId + 1);
    const turnId = canonicalState.nextTurnId ?? asTurnId(0);
    const rootEntry = entryForDecision(microturn, decision);
    const rootFrame: DecisionStackFrame = {
      frameId: rootFrameId,
      parentFrameId: null,
      turnId,
      context: microturn.decisionContext,
      accumulatedBindings: {},
      effectFrame: {
        programCounter: 0,
        boundedIterationCursors: {},
        localBindings: {},
        pendingTriggerQueue: [],
        decisionHistory: [rootEntry],
      },
    };
    const childFrame: DecisionStackFrame = {
      frameId: childFrameId,
      parentFrameId: rootFrame.frameId,
      turnId,
      context: {
        kind: 'chooseOne',
        seatId: pendingSeatId(def, canonicalState, microturn.seatId, continuation.nextDecision.decisionPlayer),
        decisionKey: continuation.nextDecision.decisionKey,
        options: continuation.nextDecision.options,
      },
      accumulatedBindings: {},
      effectFrame: {
        programCounter: 0,
        boundedIterationCursors: {},
        localBindings: {},
        pendingTriggerQueue: [],
      },
    };
    const nextState = updateHash(def, {
      ...canonicalState,
      decisionStack: [rootFrame, childFrame],
      nextFrameId: asDecisionFrameId(childFrameId + 1),
      activeDeciderSeatId: childFrame.context.seatId,
    }, resolvedRuntime);
    return {
      state: nextState,
      log: createDecisionLog(nextState, microturn, decision, false, [], []),
      triggerFirings: [],
      warnings: [],
    };
  }

  if (decision.kind === 'chooseOne') {
    const rootFrame = rootFrameFor(canonicalState);
    if (rootFrame === undefined) {
      throw new Error('MICROTURN_ROOT_FRAME_MISSING');
    }
    const history = [...rootHistory(rootFrame), entryForDecision(microturn, decision)];
    const move = rebuildMoveFromTrace(history);
    const continuation = resolveMoveDecisionSequence(def, canonicalState, move, { choose: () => undefined }, resolvedRuntime);
    if (continuation.illegal !== undefined || continuation.stochasticDecision !== undefined || continuation.nextDecisionSet !== undefined) {
      throw new Error(`UNSUPPORTED_CONTEXT_KIND_THIS_TICKET:${decision.kind}`);
    }
    if (continuation.nextDecision === undefined) {
      return applyChosenMove(def, canonicalState, continuation.move, microturn, decision, options, resolvedRuntime);
    }
    if (continuation.nextDecision.type !== 'chooseOne') {
      throw new Error(`UNSUPPORTED_CONTEXT_KIND_THIS_TICKET:${continuation.nextDecision.type}`);
    }
    const updatedRoot = appendTraceEntry(rootFrame, entryForDecision(microturn, decision));
    const nextChildFrame: DecisionStackFrame = {
      frameId: canonicalState.nextFrameId ?? asDecisionFrameId(0),
      parentFrameId: updatedRoot.frameId,
      turnId: updatedRoot.turnId,
      context: {
        kind: 'chooseOne',
        seatId: pendingSeatId(def, canonicalState, microturn.seatId, continuation.nextDecision.decisionPlayer),
        decisionKey: continuation.nextDecision.decisionKey,
        options: continuation.nextDecision.options,
      },
      accumulatedBindings: {
        ...rootFrame.accumulatedBindings,
        [decision.decisionKey]: decision.value,
      },
      effectFrame: {
        programCounter: 0,
        boundedIterationCursors: {},
        localBindings: {},
        pendingTriggerQueue: [],
      },
    };
    const nextState = updateHash(def, {
      ...canonicalState,
      decisionStack: [updatedRoot, nextChildFrame],
      nextFrameId: asDecisionFrameId((canonicalState.nextFrameId ?? asDecisionFrameId(0)) + 1),
      activeDeciderSeatId: nextChildFrame.context.seatId,
    }, resolvedRuntime);
    return {
      state: nextState,
      log: createDecisionLog(nextState, microturn, decision, false, [], []),
      triggerFirings: [],
      warnings: [],
    };
  }

  if (decision.kind === 'turnRetirement') {
    const baseState = clearMicroturnState(def, canonicalState, resolvedRuntime);
    const triggerFirings: TriggerLogEntry[] = [];
    const advanced = advancePhase(buildAdvancePhaseRequest(def, baseState, createEvalRuntimeResources(), {
      cachedRuntime: resolvedRuntime,
      triggerLogCollector: triggerFirings,
    }));
    const nextState = updateHash(def, {
      ...advanced,
      nextTurnId: asTurnId((canonicalState.nextTurnId ?? asTurnId(0)) + 1),
      decisionStack: [],
      activeDeciderSeatId: resolveActiveDeciderSeatIdForPlayer(def, Number(advanced.activePlayer)),
    }, resolvedRuntime);
    return {
      state: nextState,
      log: createDecisionLog(nextState, microturn, decision, true, triggerFirings, []),
      triggerFirings,
      warnings: [],
    };
  }

  throw new Error(`UNSUPPORTED_CONTEXT_KIND_THIS_TICKET:${decision.kind}`);
};
