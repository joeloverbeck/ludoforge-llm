import {
  asDecisionFrameId,
  asTurnId,
  resolveActiveDeciderSeatIdForPlayer,
  type ApplyDecisionResult,
  type CompoundTurnTraceEntry,
  type Decision,
  type DecisionLog,
  type DecisionStackFrame,
  type EffectExecutionFrameSnapshot,
  type StochasticDistribution,
} from './types.js';
import { applyMove } from '../apply-move.js';
import { createEvalRuntimeResources } from '../eval-context.js';
import { createGameDefRuntime, type GameDefRuntime } from '../gamedef-runtime.js';
import { deepEqual } from '../deep-equal.js';
import { markOffered, withPendingFreeOperationGrants } from '../grant-lifecycle.js';
import { advancePhase, buildAdvancePhaseRequest } from '../phase-advance.js';
import { nextInt } from '../prng.js';
import type { DecisionKey } from '../decision-scope.js';
import type { ExecutionOptions, GameDef, GameState, Move, Rng, TriggerLogEntry } from '../types-core.js';
import type { MoveParamScalar } from '../types-ast.js';
import { computeFullHash, createZobristTable } from '../zobrist.js';
import {
  advanceChooseNStepContext,
  publishMicroturn,
  rebuildMoveFromFrame,
  toChooseNStepDecisions,
  toDecisionStackContext,
  toStochasticDecisionStackContext,
  withResolvedHash,
} from './publish.js';
import { resolveDecisionContinuation, type DecisionContinuationResult } from './continuation.js';
import { resumeSuspendedEffectFrame } from './resume.js';

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

const emptyEffectFrame = (): EffectExecutionFrameSnapshot => ({
  programCounter: 0,
  boundedIterationCursors: {},
  localBindings: {},
  pendingTriggerQueue: [],
});

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

const isTemplateActionSelectionMatch = (
  candidate: Extract<Decision, { readonly kind: 'actionSelection' }>,
  decision: Extract<Decision, { readonly kind: 'actionSelection' }>,
): boolean => {
  if (
    candidate.actionId !== decision.actionId
    || candidate.move === undefined
    || decision.move === undefined
    || candidate.move.freeOperation !== decision.move.freeOperation
    || candidate.move.actionClass !== decision.move.actionClass
  ) {
    return false;
  }

  return Object.entries(candidate.move.params).every(([key, value]) =>
    deepEqual(decision.move?.params[key], value),
  );
};

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
      && (
        deepEqual(candidate.move ?? null, decision.move ?? null)
        || isTemplateActionSelectionMatch(candidate, decision)
      );
  }
  if (candidate.kind === 'chooseOne' && decision.kind === 'chooseOne') {
    return candidate.decisionKey === decision.decisionKey
      && deepEqual(candidate.value, decision.value);
  }
  if (candidate.kind === 'chooseNStep' && decision.kind === 'chooseNStep') {
    return candidate.decisionKey === decision.decisionKey
      && candidate.command === decision.command
      && deepEqual(candidate.value ?? null, decision.value ?? null);
  }
  if (candidate.kind === 'stochasticResolve' && decision.kind === 'stochasticResolve') {
    return candidate.decisionKey === decision.decisionKey
      && deepEqual(candidate.value, decision.value);
  }
  if (candidate.kind === 'outcomeGrantResolve' && decision.kind === 'outcomeGrantResolve') {
    return candidate.grantId === decision.grantId;
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

const withAccumulatedBinding = (
  frame: DecisionStackFrame,
  decisionKey: DecisionKey,
  value: readonly MoveParamScalar[],
): DecisionStackFrame => {
  const nextBindings = { ...frame.accumulatedBindings };
  if (value.length === 0) {
    delete nextBindings[decisionKey];
  } else {
    nextBindings[decisionKey] = value;
  }
  return {
    ...frame,
    accumulatedBindings: nextBindings,
  };
};

const withAccumulatedBindingsFromMove = (
  frame: DecisionStackFrame,
  move: Move,
): DecisionStackFrame => ({
  ...frame,
  accumulatedBindings: {
    ...frame.accumulatedBindings,
    ...Object.fromEntries(
      Object.entries(move.params).filter(([key]) => key.startsWith('$') || key.startsWith('decision:')),
    ),
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
  const nextState = updateHash(def, {
    ...applied.state,
    activeDeciderSeatId: resolveActiveDeciderSeatIdForPlayer(def, Number(applied.state.activePlayer)),
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

const spawnPendingFrame = (
  def: GameDef,
  canonicalState: GameState,
  microturn: ReturnType<typeof publishMicroturn>,
  decision: Decision,
  continuation: DecisionContinuationResult,
  runtime: GameDefRuntime,
): ApplyDecisionResult => {
  const rootFrame = rootFrameFor(canonicalState);
  if (rootFrame === undefined) {
    throw new Error('MICROTURN_ROOT_FRAME_MISSING');
  }
  const updatedRoot = withAccumulatedBindingsFromMove(
    appendTraceEntry(rootFrame, entryForDecision(microturn, decision)),
    continuation.move,
  );
  const frameId = canonicalState.nextFrameId ?? asDecisionFrameId(0);
  const nextFrame: DecisionStackFrame = continuation.stochasticDecision !== undefined
    ? {
      frameId,
      parentFrameId: updatedRoot.frameId,
      turnId: updatedRoot.turnId,
      context: toStochasticDecisionStackContext(continuation),
      accumulatedBindings: updatedRoot.accumulatedBindings,
      effectFrame: {
        ...emptyEffectFrame(),
        ...(continuation.suspendedFrame === undefined ? {} : { suspendedFrame: continuation.suspendedFrame }),
      },
    }
    : {
      frameId,
      parentFrameId: updatedRoot.frameId,
      turnId: updatedRoot.turnId,
        context: toDecisionStackContext(
          continuation.nextDecision!,
          pendingSeatId(def, canonicalState, microturn.seatId, continuation.nextDecision?.decisionPlayer),
          continuation.nextChooseNTemplate,
        ),
        accumulatedBindings: updatedRoot.accumulatedBindings,
        effectFrame: {
          ...emptyEffectFrame(),
          ...(continuation.suspendedFrame === undefined ? {} : { suspendedFrame: continuation.suspendedFrame }),
        },
      };
  const nextState = updateHash(def, {
    ...canonicalState,
    decisionStack: [updatedRoot, nextFrame],
    nextFrameId: asDecisionFrameId(Number(frameId) + 1),
    activeDeciderSeatId: nextFrame.context.seatId,
  }, runtime);
  return {
    state: nextState,
    log: createDecisionLog(nextState, microturn, decision, false, [], []),
    triggerFirings: [],
    warnings: [],
  };
};

const continueResolvedMove = (
  def: GameDef,
  canonicalState: GameState,
  move: Move,
  microturn: ReturnType<typeof publishMicroturn>,
  decision: Decision,
  options: ExecutionOptions | undefined,
  runtime: GameDefRuntime,
): ApplyDecisionResult => {
  const continuation = resolveDecisionContinuation(def, canonicalState, move, { choose: () => undefined }, runtime);
  if (continuation.illegal !== undefined) {
    throw new Error(`UNSUPPORTED_CONTEXT_KIND_THIS_TICKET:${decision.kind}`);
  }
  if (continuation.nextDecision === undefined && continuation.stochasticDecision === undefined) {
    return applyChosenMove(def, canonicalState, continuation.move, microturn, decision, options, runtime);
  }
  return spawnPendingFrame(def, canonicalState, microturn, decision, continuation, runtime);
};

export const resolveStochasticDistribution = (
  rng: Rng,
  distribution: StochasticDistribution,
): { readonly value: MoveParamScalar; readonly rng: Rng } => {
  if (distribution.outcomes.length === 0) {
    throw new Error('resolveStochasticDistribution requires at least one outcome');
  }
  const totalWeight = distribution.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
  const [roll, nextRng] = nextInt(rng, 0, Math.max(0, totalWeight - 1));
  let cursor = 0;
  for (const outcome of distribution.outcomes) {
    cursor += outcome.weight;
    if (roll < cursor) {
      return { value: outcome.value as MoveParamScalar, rng: nextRng };
    }
  }
  return { value: distribution.outcomes.at(-1)!.value as MoveParamScalar, rng: nextRng };
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
  return applyPublishedDecision(def, canonicalState, microturn, decision, options, resolvedRuntime);
};

export const applyPublishedDecision = (
  def: GameDef,
  state: GameState,
  microturn: ReturnType<typeof publishMicroturn>,
  decision: Decision,
  options?: ExecutionOptions,
  runtime?: GameDefRuntime,
): ApplyDecisionResult => {
  const resolvedRuntime = runtime ?? createGameDefRuntime(def);
  const canonicalState = withResolvedHash(def, state, resolvedRuntime);

  if (decision.kind === 'actionSelection') {
    const move = decision.move ?? { actionId: decision.actionId, params: {} };
    const continuation = resolveDecisionContinuation(def, canonicalState, move, { choose: () => undefined }, resolvedRuntime);
    if (continuation.illegal !== undefined) {
      throw new Error(`UNSUPPORTED_CONTEXT_KIND_THIS_TICKET:${decision.kind}`);
    }
    if (continuation.nextDecision === undefined && continuation.stochasticDecision === undefined) {
      return applyChosenMove(def, canonicalState, continuation.move, microturn, decision, options, resolvedRuntime);
    }

    const rootFrameId = canonicalState.nextFrameId ?? asDecisionFrameId(0);
    const childFrameId = asDecisionFrameId(Number(rootFrameId) + 1);
    const turnId = canonicalState.nextTurnId ?? asTurnId(0);
    const rootEntry = entryForDecision(microturn, decision);
    const rootFrame: DecisionStackFrame = {
      frameId: rootFrameId,
      parentFrameId: null,
      turnId,
      context: microturn.decisionContext,
      accumulatedBindings: Object.fromEntries(
        Object.entries(continuation.move.params).filter(([key]) => key.startsWith('$') || key.startsWith('decision:')),
      ),
      effectFrame: {
        ...emptyEffectFrame(),
        decisionHistory: [rootEntry],
      },
    };
    const childFrame: DecisionStackFrame = continuation.stochasticDecision !== undefined
      ? {
        frameId: childFrameId,
        parentFrameId: rootFrame.frameId,
        turnId,
        context: toStochasticDecisionStackContext(continuation),
        accumulatedBindings: {},
        effectFrame: {
          ...emptyEffectFrame(),
          ...(continuation.suspendedFrame === undefined ? {} : { suspendedFrame: continuation.suspendedFrame }),
        },
      }
      : {
        frameId: childFrameId,
        parentFrameId: rootFrame.frameId,
        turnId,
        context: toDecisionStackContext(
          continuation.nextDecision!,
          pendingSeatId(def, canonicalState, microturn.seatId, continuation.nextDecision?.decisionPlayer),
          continuation.nextChooseNTemplate,
        ),
        accumulatedBindings: {},
        effectFrame: {
          ...emptyEffectFrame(),
          ...(continuation.suspendedFrame === undefined ? {} : { suspendedFrame: continuation.suspendedFrame }),
        },
      };
    const nextState = updateHash(def, {
      ...canonicalState,
      decisionStack: [rootFrame, childFrame],
      nextFrameId: asDecisionFrameId(Number(childFrameId) + 1),
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
    const topFrame = canonicalState.decisionStack?.at(-1);
    if (rootFrame === undefined) {
      throw new Error('MICROTURN_ROOT_FRAME_MISSING');
    }
    const move = {
      ...rebuildMoveFromFrame(rootFrame),
      params: {
        ...rebuildMoveFromFrame(rootFrame).params,
        [decision.decisionKey]: decision.value,
      },
    };
    if (topFrame?.effectFrame.suspendedFrame !== undefined) {
      const continuation = resumeSuspendedEffectFrame(
        def,
        topFrame.effectFrame.suspendedFrame,
        move,
        resolvedRuntime,
      );
      if (continuation.nextDecision === undefined && continuation.stochasticDecision === undefined) {
        return applyChosenMove(def, canonicalState, continuation.move, microturn, decision, options, resolvedRuntime);
      }
      return spawnPendingFrame(def, canonicalState, microturn, decision, continuation, resolvedRuntime);
    }
    return continueResolvedMove(def, canonicalState, move, microturn, decision, options, resolvedRuntime);
  }

  if (decision.kind === 'chooseNStep') {
    const rootFrame = rootFrameFor(canonicalState);
    const top = canonicalState.decisionStack?.at(-1);
    if (rootFrame === undefined || top?.context.kind !== 'chooseNStep') {
      throw new Error('MICROTURN_CHOOSE_N_FRAME_MISSING');
    }
    const baseMove = rebuildMoveFromFrame(rootFrame);
    const advanced = advanceChooseNStepContext(top.context, decision);
    const tracedRoot = advanced.done
      ? {
        ...appendTraceEntry(rootFrame, entryForDecision(microturn, decision)),
        accumulatedBindings: {
          ...rootFrame.accumulatedBindings,
          [decision.decisionKey]: advanced.value,
        },
      }
      : appendTraceEntry(rootFrame, entryForDecision(microturn, decision));
    if (!advanced.done) {
      const updatedRoot = withAccumulatedBinding(
        tracedRoot,
        decision.decisionKey,
        advanced.nextContext.selectedSoFar,
      );
      const nextTop: DecisionStackFrame = {
        ...top,
        context: advanced.nextContext,
      };
      const nextState = updateHash(def, {
        ...canonicalState,
        decisionStack: [updatedRoot, nextTop],
        activeDeciderSeatId: nextTop.context.seatId,
      }, resolvedRuntime);
      const selectedKeys = new Set(
        advanced.nextContext.selectedSoFar.map((value) => JSON.stringify([typeof value, value])),
      );
      const hasRemainingLegalAdd = advanced.nextContext.options.some((option) =>
        option.legality !== 'illegal'
        && !Array.isArray(option.value)
        && !selectedKeys.has(JSON.stringify([typeof option.value, option.value])),
      );
      const needsBridgeabilityCollapse =
        decision.command === 'add'
        && advanced.nextContext.selectedSoFar.length > 0
        && !hasRemainingLegalAdd;
      const nextLegalActions = needsBridgeabilityCollapse
        ? toChooseNStepDecisions(
          def,
          nextState,
          rebuildMoveFromFrame(updatedRoot),
          advanced.nextContext,
          nextTop.effectFrame,
          resolvedRuntime,
        )
        : [];
      const autoCompleteChooseN =
        needsBridgeabilityCollapse
        && nextLegalActions.length > 0
        && nextLegalActions.every((candidate) =>
          candidate.kind === 'chooseNStep'
          && candidate.command === 'remove'
          && candidate.decisionKey === advanced.nextContext.decisionKey,
        );
      if (autoCompleteChooseN) {
        const move: Move = {
          ...baseMove,
          params: {
            ...baseMove.params,
            [decision.decisionKey]: advanced.nextContext.selectedSoFar,
          },
        };
        return continueResolvedMove(def, nextState, move, microturn, decision, options, resolvedRuntime);
      }
      return {
        state: nextState,
        log: createDecisionLog(nextState, microturn, decision, false, [], []),
        triggerFirings: [],
        warnings: [],
      };
    }
    const move: Move = {
      ...baseMove,
      params: {
        ...baseMove.params,
        [decision.decisionKey]: advanced.value,
      },
    };
    if (top.effectFrame.suspendedFrame !== undefined) {
      const continuation = resumeSuspendedEffectFrame(
        def,
        top.effectFrame.suspendedFrame,
        move,
        resolvedRuntime,
      );
      if (continuation.nextDecision === undefined && continuation.stochasticDecision === undefined) {
        return applyChosenMove(def, canonicalState, continuation.move, microturn, decision, options, resolvedRuntime);
      }
      const nextState = {
        ...canonicalState,
        decisionStack: [tracedRoot, top],
      };
      return spawnPendingFrame(def, nextState, microturn, decision, continuation, resolvedRuntime);
    }
    const nextState = {
      ...canonicalState,
      decisionStack: [tracedRoot, top],
    };
    return continueResolvedMove(def, nextState, move, microturn, decision, options, resolvedRuntime);
  }

  if (decision.kind === 'stochasticResolve') {
    const rootFrame = rootFrameFor(canonicalState);
    if (rootFrame === undefined) {
      throw new Error('MICROTURN_ROOT_FRAME_MISSING');
    }
    const baseMove = rebuildMoveFromFrame(rootFrame);
    const move: Move = {
      ...baseMove,
      params: {
        ...baseMove.params,
        [decision.decisionKey]: decision.value,
      },
    };
    return continueResolvedMove(def, canonicalState, move, microturn, decision, options, resolvedRuntime);
  }

  if (decision.kind === 'outcomeGrantResolve') {
    if (canonicalState.turnOrderState.type !== 'cardDriven') {
      throw new Error('MICROTURN_OUTCOME_GRANT_REQUIRES_CARD_DRIVEN_TURN_FLOW');
    }
    const pending = canonicalState.turnOrderState.runtime.pendingFreeOperationGrants ?? [];
    const grantIndex = pending.findIndex((grant) => grant.grantId === decision.grantId);
    if (grantIndex < 0) {
      throw new Error(`MICROTURN_OUTCOME_GRANT_NOT_FOUND:${decision.grantId}`);
    }
    const transitioned = markOffered(pending[grantIndex]!);
    const nextPending = [...pending];
    nextPending[grantIndex] = transitioned.grant;
    const nextState = updateHash(def, {
      ...canonicalState,
      turnOrderState: {
        type: 'cardDriven',
        runtime: withPendingFreeOperationGrants(canonicalState.turnOrderState.runtime, nextPending),
      },
      decisionStack: canonicalState.decisionStack?.slice(0, -1) ?? [],
      activeDeciderSeatId: '__kernel',
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

  throw new Error(`UNSUPPORTED_CONTEXT_KIND_THIS_TICKET:${JSON.stringify(decision)}`);
};
