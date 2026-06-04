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
  type MicroturnState,
  type PreviewDriveOrigin,
  type PreviewDriveResult,
} from './types.js';
import { applyMove } from '../apply-move.js';
import { createEvalRuntimeResources } from '../eval-context.js';
import type { ResolveRefCache } from '../resolve-ref.js';
import { createGameDefRuntime, type GameDefRuntime } from '../gamedef-runtime.js';
import {
  expireReadyBlockingGrantsForSeat,
  markOffered,
  withPendingFreeOperationGrants,
} from '../grant-lifecycle.js';
import { advancePhase, buildAdvancePhaseRequest } from '../phase-advance.js';
import type { MutableTokenStateIndex } from '../token-state-index.js';
import type { DecisionKey } from '../decision-scope.js';
import type { ExecutionOptions, GameDef, GameState, Move, TriggerLogEntry } from '../types-core.js';
import type { MoveParamScalar } from '../types-ast.js';
import { computeFullHash, createZobristTable } from '../zobrist.js';
import {
  advanceChooseNStepContext,
  publishMicroturnGreedyChooseOne,
  rebuildMoveFromFrame,
  toChooseNStepDecisions,
  toDecisionStackContext,
  toStochasticDecisionStackContext,
} from './publish.js';
import { resolveDecisionContinuation, type DecisionContinuationResult } from './continuation.js';
import { resumeSuspendedEffectFrame } from './resume.js';
import {
  COMPOUND_SPECIAL_ACTIVITY_BINDING_PREFIX,
  continuationBindingsFromMove,
  mergeContinuationBindingsFromMove,
} from './continuation-bindings.js';

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

const canonicalizeState = (def: GameDef, state: GameState, runtime?: GameDefRuntime): GameState => {
  const table = runtime?.zobristTable ?? createZobristTable(def);
  const hash = computeFullHash(table, state);
  return {
    ...state,
    stateHash: hash,
    _runningHash: hash,
  };
};

export const canonicalizePreviewDriveState = canonicalizeState;

const clearMicroturnStateNoFinalHash = (
  def: GameDef,
  state: GameState,
): GameState => ({
  ...state,
  decisionStack: [],
  activeDeciderSeatId: resolveActiveDeciderSeatIdForPlayer(def, Number(state.activePlayer)),
});

const clearUnavailableActionsForTurn = (
  state: GameState,
  retiringTurnId: ReturnType<typeof asTurnId>,
): GameState => {
  const unavailable = state.unavailableActionsPerTurn;
  if (unavailable === undefined) {
    return state;
  }
  const prefix = `${String(retiringTurnId)}:`;
  const retained = Object.fromEntries(
    Object.entries(unavailable).filter(([key]) => !key.startsWith(prefix)),
  );
  if (Object.keys(retained).length === 0) {
    const { unavailableActionsPerTurn: _unavailableActionsPerTurn, ...rest } = state;
    void _unavailableActionsPerTurn;
    return rest;
  }
  return { ...state, unavailableActionsPerTurn: retained };
};

const emptyEffectFrame = (): EffectExecutionFrameSnapshot => ({
  programCounter: 0,
  boundedIterationCursors: {},
  localBindings: {},
  pendingTriggerQueue: [],
});

const decisionContextKey = (microturn: MicroturnState): DecisionKey | null => {
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
  fallbackSeatId: MicroturnState['seatId'],
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

const actionHasTag = (
  def: GameDef,
  actionId: Move['actionId'],
  tag: string,
): boolean =>
  def.actions.find((action) => action.id === actionId)?.tags?.includes(tag) === true;

const isSingletonPassFallback = (
  def: GameDef,
  microturn: MicroturnState,
  decision: Extract<Decision, { readonly kind: 'actionSelection' }>,
): boolean =>
  microturn.kind === 'actionSelection'
  && microturn.legalActions.length === 1
  && actionHasTag(def, decision.actionId, 'pass')
  && microturn.legalActions[0]?.kind === 'actionSelection'
  && microturn.legalActions[0]?.actionId === decision.actionId;

const reconcilePassFallbackBlockingGrants = (
  def: GameDef,
  state: GameState,
  microturn: MicroturnState,
  decision: Extract<Decision, { readonly kind: 'actionSelection' }>,
): GameState => {
  if (!isSingletonPassFallback(def, microturn, decision) || state.turnOrderState.type !== 'cardDriven') {
    return state;
  }
  const pending = state.turnOrderState.runtime.pendingFreeOperationGrants ?? [];
  if (pending.length === 0) {
    return state;
  }
  const expired = expireReadyBlockingGrantsForSeat(pending, String(microturn.seatId));
  if (expired.grants.length === pending.length) {
    return state;
  }
  return withPendingFreeOperationGrants(state, expired.grants.length === 0 ? undefined : expired.grants);
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
  context: Extract<DecisionStackFrame['context'], { readonly kind: 'chooseNStep' }>,
  value: readonly MoveParamScalar[],
): DecisionStackFrame => {
  const nextBindings: Record<string, Move['params'][string]> = { ...(frame.continuationBindings ?? {}) };
  const decisionKey = context.decisionPath === 'compound.specialActivity'
    ? `${COMPOUND_SPECIAL_ACTIVITY_BINDING_PREFIX}${context.decisionKey}`
    : context.decisionKey;
  if (value.length === 0) {
    delete nextBindings[decisionKey];
  } else {
    nextBindings[decisionKey] = value;
  }
  const frameWithoutBindings = { ...frame };
  delete frameWithoutBindings.continuationBindings;
  return {
    ...frameWithoutBindings,
    ...(Object.keys(nextBindings).length === 0 ? {} : { continuationBindings: nextBindings }),
  };
};

const withAccumulatedBindingsFromMove = (
  frame: DecisionStackFrame,
  move: Move,
): DecisionStackFrame => ({
  ...frame,
  continuationBindings: mergeContinuationBindingsFromMove(frame.continuationBindings, move),
});

const withDecisionParam = (
  move: Move,
  context: Extract<DecisionStackFrame['context'], { readonly kind: 'chooseOne' | 'chooseNStep' }>,
  value: MoveParamScalar | readonly MoveParamScalar[],
): Move => {
  if (context.decisionPath === 'compound.specialActivity' && move.compound !== undefined) {
    return {
      ...move,
      compound: {
        ...move.compound,
        specialActivity: {
          ...move.compound.specialActivity,
          params: {
            ...move.compound.specialActivity.params,
            [context.decisionKey]: value,
          },
        },
      },
    };
  }
  return {
    ...move,
    params: {
      ...move.params,
      [context.decisionKey]: value,
    },
  };
};

const entryForDecision = (
  microturn: MicroturnState,
  decision: Decision,
): CompoundTurnTraceEntry => ({
  seatId: microturn.seatId,
  decisionContextKind: microturn.kind,
  decisionKey: decisionContextKey(microturn),
  decision,
  frameId: microturn.frameId,
});

const createDecisionLog = (
  state: GameState,
  microturn: MicroturnState,
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

const applyChosenMoveNoFinalHash = (
  def: GameDef,
  state: GameState,
  move: Move,
  microturn: MicroturnState,
  decision: Decision,
  options?: ExecutionOptions,
  runtime?: GameDefRuntime,
  resolveRefCache?: ResolveRefCache,
): ApplyDecisionResult => {
  const baseState = clearMicroturnStateNoFinalHash(def, state);
  const applied = applyMove(def, baseState, move, options, runtime, resolveRefCache);
  const triggerFirings = [...applied.triggerFirings];
  const nextState = {
    ...applied.state,
    activeDeciderSeatId: resolveActiveDeciderSeatIdForPlayer(def, Number(applied.state.activePlayer)),
    decisionStack: [],
    nextTurnId: asTurnId((state.nextTurnId ?? asTurnId(0)) + 1),
  };
  return {
    state: nextState,
    log: createDecisionLog(nextState, microturn, decision, true, triggerFirings, applied.warnings, optionalLogExtras(applied)),
    triggerFirings,
    warnings: applied.warnings,
    ...optionalLogExtras(applied),
  };
};

const spawnPendingFrameNoFinalHash = (
  def: GameDef,
  canonicalState: GameState,
  microturn: MicroturnState,
  decision: Decision,
  continuation: DecisionContinuationResult,
  _runtime: GameDefRuntime,
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
      effectFrame: {
        ...emptyEffectFrame(),
        ...(continuation.suspendedFrame === undefined ? {} : { suspendedFrame: continuation.suspendedFrame }),
      },
    };
  const nextState = {
    ...canonicalState,
    decisionStack: [updatedRoot, nextFrame],
    nextFrameId: asDecisionFrameId(Number(frameId) + 1),
    activeDeciderSeatId: nextFrame.context.seatId,
  };
  return {
    state: nextState,
    log: createDecisionLog(nextState, microturn, decision, false, [], []),
    triggerFirings: [],
    warnings: [],
  };
};

const continueResolvedMoveNoFinalHash = (
  def: GameDef,
  canonicalState: GameState,
  move: Move,
  microturn: MicroturnState,
  decision: Decision,
  options: ExecutionOptions | undefined,
  runtime: GameDefRuntime,
  resolveRefCache: ResolveRefCache | undefined,
): ApplyDecisionResult => {
  const continuation = resolveDecisionContinuation(def, canonicalState, move, { choose: () => undefined }, runtime);
  if (continuation.illegal !== undefined) {
    throw new Error(`MICROTURN_APPLY_DECISION_CONTINUATION_ILLEGAL:${decision.kind}`);
  }
  if (continuation.nextDecision === undefined && continuation.stochasticDecision === undefined) {
    return applyChosenMoveNoFinalHash(def, canonicalState, continuation.move, microturn, decision, options, runtime, resolveRefCache);
  }
  return spawnPendingFrameNoFinalHash(def, canonicalState, microturn, decision, continuation, runtime);
};

const applyPublishedDecisionInternalNoFinalHash = (
  def: GameDef,
  canonicalState: GameState,
  microturn: MicroturnState,
  decision: Decision,
  options: ExecutionOptions | undefined,
  resolvedRuntime: GameDefRuntime,
  resolveRefCache: ResolveRefCache | undefined,
): ApplyDecisionResult => {
  if (decision.kind === 'actionSelection') {
    const move = decision.move ?? { actionId: decision.actionId, params: {} };
    const grantReconciledState = reconcilePassFallbackBlockingGrants(
      def,
      canonicalState,
      microturn,
      decision,
    );
    const continuation = resolveDecisionContinuation(def, grantReconciledState, move, { choose: () => undefined }, resolvedRuntime);
    if (continuation.illegal !== undefined) {
      throw new Error(`MICROTURN_APPLY_DECISION_CONTINUATION_ILLEGAL:${decision.kind}`);
    }
    if (continuation.nextDecision === undefined && continuation.stochasticDecision === undefined) {
      return applyChosenMoveNoFinalHash(def, grantReconciledState, continuation.move, microturn, decision, options, resolvedRuntime, resolveRefCache);
    }

    const rootFrameId = grantReconciledState.nextFrameId ?? asDecisionFrameId(0);
    const childFrameId = asDecisionFrameId(Number(rootFrameId) + 1);
    const turnId = grantReconciledState.nextTurnId ?? asTurnId(0);
    const rootEntry = entryForDecision(microturn, decision);
    const rootFrame: DecisionStackFrame = {
      frameId: rootFrameId,
      parentFrameId: null,
      turnId,
      context: microturn.decisionContext,
      continuationBindings: continuationBindingsFromMove(continuation.move),
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
        effectFrame: {
          ...emptyEffectFrame(),
          ...(continuation.suspendedFrame === undefined ? {} : { suspendedFrame: continuation.suspendedFrame }),
        },
      };
    const nextState = {
      ...grantReconciledState,
      decisionStack: [rootFrame, childFrame],
      nextFrameId: asDecisionFrameId(Number(childFrameId) + 1),
      activeDeciderSeatId: childFrame.context.seatId,
    };
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
    if (rootFrame === undefined || topFrame?.context.kind !== 'chooseOne') {
      throw new Error('MICROTURN_ROOT_FRAME_MISSING');
    }
    const move = withDecisionParam(rebuildMoveFromFrame(rootFrame), topFrame.context, decision.value);
    if (topFrame?.effectFrame.suspendedFrame !== undefined) {
      const continuation = resumeSuspendedEffectFrame(
        def,
        topFrame.effectFrame.suspendedFrame,
        move,
        resolvedRuntime,
      );
      if (continuation.nextDecision === undefined && continuation.stochasticDecision === undefined) {
        return applyChosenMoveNoFinalHash(def, canonicalState, continuation.move, microturn, decision, options, resolvedRuntime, resolveRefCache);
      }
      return spawnPendingFrameNoFinalHash(def, canonicalState, microturn, decision, continuation, resolvedRuntime);
    }
    return continueResolvedMoveNoFinalHash(def, canonicalState, move, microturn, decision, options, resolvedRuntime, resolveRefCache);
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
        continuationBindings: mergeContinuationBindingsFromMove(
          rootFrame.continuationBindings,
          withDecisionParam(baseMove, top.context, advanced.value),
        ),
      }
      : appendTraceEntry(rootFrame, entryForDecision(microturn, decision));
    if (!advanced.done) {
      const updatedRoot = withAccumulatedBinding(
        tracedRoot,
        advanced.nextContext,
        advanced.nextContext.selectedSoFar,
      );
      const nextTop: DecisionStackFrame = {
        ...top,
        context: advanced.nextContext,
      };
      const nextState = {
        ...canonicalState,
        decisionStack: [updatedRoot, nextTop],
        activeDeciderSeatId: nextTop.context.seatId,
      };
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
        const move = withDecisionParam(baseMove, advanced.nextContext, advanced.nextContext.selectedSoFar);
        return continueResolvedMoveNoFinalHash(def, nextState, move, microturn, decision, options, resolvedRuntime, resolveRefCache);
      }
      return {
        state: nextState,
        log: createDecisionLog(nextState, microturn, decision, false, [], []),
        triggerFirings: [],
        warnings: [],
      };
    }
    const move = withDecisionParam(baseMove, top.context, advanced.value);
    if (top.effectFrame.suspendedFrame !== undefined) {
      const continuation = resumeSuspendedEffectFrame(
        def,
        top.effectFrame.suspendedFrame,
        move,
        resolvedRuntime,
      );
      if (continuation.nextDecision === undefined && continuation.stochasticDecision === undefined) {
        return applyChosenMoveNoFinalHash(def, canonicalState, continuation.move, microturn, decision, options, resolvedRuntime, resolveRefCache);
      }
      const nextState = {
        ...canonicalState,
        decisionStack: [tracedRoot, top],
      };
      return spawnPendingFrameNoFinalHash(def, nextState, microturn, decision, continuation, resolvedRuntime);
    }
    const nextState = {
      ...canonicalState,
      decisionStack: [tracedRoot, top],
    };
    return continueResolvedMoveNoFinalHash(def, nextState, move, microturn, decision, options, resolvedRuntime, resolveRefCache);
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
    return continueResolvedMoveNoFinalHash(def, canonicalState, move, microturn, decision, options, resolvedRuntime, resolveRefCache);
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
    const nextState: GameState = {
      ...canonicalState,
      turnOrderState: withPendingFreeOperationGrants(canonicalState, nextPending).turnOrderState,
      decisionStack: canonicalState.decisionStack?.slice(0, -1) ?? [],
      activeDeciderSeatId: '__kernel' as const,
    };
    return {
      state: nextState,
      log: createDecisionLog(nextState, microturn, decision, false, [], []),
      triggerFirings: [],
      warnings: [],
    };
  }

  if (decision.kind === 'turnRetirement') {
    const baseState = clearUnavailableActionsForTurn(
      clearMicroturnStateNoFinalHash(def, canonicalState),
      decision.retiringTurnId,
    );
    const triggerFirings: TriggerLogEntry[] = [];
    const advanced = advancePhase(buildAdvancePhaseRequest(def, baseState, createEvalRuntimeResources({
      tokenStateIndexCache: resolvedRuntime.tokenStateIndexCache,
      compiledQueryPlanCache: resolvedRuntime.compiledQueryPlanCache,
    }), {
      cachedRuntime: resolvedRuntime,
      triggerLogCollector: triggerFirings,
    }));
    const nextState = {
      ...advanced,
      nextTurnId: asTurnId((canonicalState.nextTurnId ?? asTurnId(0)) + 1),
      decisionStack: [],
      activeDeciderSeatId: resolveActiveDeciderSeatIdForPlayer(def, Number(advanced.activePlayer)),
    };
    return {
      state: nextState,
      log: createDecisionLog(nextState, microturn, decision, true, triggerFirings, []),
      triggerFirings,
      warnings: [],
    };
  }

  throw new Error(`MICROTURN_DECISION_KIND_UNSUPPORTED:${JSON.stringify(decision)}`);
};

/**
 * Preview-only apply helper that intentionally skips the final canonical hash.
 * Callers must keep the returned state private, ignore the returned log's
 * stateHash, and canonicalize before exposing preview results or telemetry.
 */
export const applyPublishedDecisionFromPreviewStateNoFinalHash = (
  def: GameDef,
  state: GameState,
  microturn: MicroturnState,
  decision: Decision,
  options?: ExecutionOptions,
  runtime?: GameDefRuntime,
  resolveRefCache?: ResolveRefCache,
): ApplyDecisionResult => {
  const resolvedRuntime = runtime ?? createGameDefRuntime(def);
  return applyPublishedDecisionInternalNoFinalHash(
    def,
    state,
    microturn,
    decision,
    options,
    resolvedRuntime,
    resolveRefCache,
  );
};

const truncateFailureReason = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.length <= 240 ? raw : `${raw.slice(0, 237)}...`;
};

export const applyPreviewDriveGreedyChooseOne = (
  def: GameDef,
  initialState: GameState,
  origin: PreviewDriveOrigin,
  depthCap: number,
  runtime?: GameDefRuntime,
  draftTokenStateIndex?: MutableTokenStateIndex,
  resolveRefCache?: ResolveRefCache,
): PreviewDriveResult => {
  const resolvedRuntime = runtime ?? createGameDefRuntime(def);
  let workingState: GameState = initialState;
  let depth = 0;
  let kind: PreviewDriveResult['kind'];

  try {
    while (true) {
      const top = workingState.decisionStack?.at(-1);
      if (top === undefined) {
        kind = 'completed';
        break;
      }

      const ctxKind = top.context.kind;
      const topSeatId = top.context.seatId;
      if (
        ctxKind === 'actionSelection'
        || ctxKind === 'chooseNStep'
        || ctxKind === 'outcomeGrantResolve'
        || ctxKind === 'turnRetirement'
        || topSeatId !== origin.seatId
        || top.turnId !== origin.turnId
      ) {
        kind = 'completed';
        break;
      }

      if (ctxKind === 'stochasticResolve') {
        kind = 'stochastic';
        break;
      }

      if (depth >= depthCap) {
        kind = 'depthCap';
        break;
      }

      const greedy = publishMicroturnGreedyChooseOne(def, workingState, resolvedRuntime);
      if (greedy === null) {
        return {
          state: canonicalizeState(def, workingState, resolvedRuntime),
          depth,
          kind: 'failed',
          failureReason: 'noPreviewDecision',
        };
      }

      const prevState = workingState;
      workingState = applyPublishedDecisionInternalNoFinalHash(
        def,
        prevState,
        greedy.microturn,
        greedy.decision,
        { advanceToDecisionPoint: true },
        resolvedRuntime,
        resolveRefCache,
      ).state;
      draftTokenStateIndex?.applyZoneDelta(prevState.zones, workingState.zones);
      draftTokenStateIndex?.attachPreviewState(workingState);
      depth += 1;
    }

    const canonicalState = canonicalizeState(def, workingState, resolvedRuntime);
    draftTokenStateIndex?.applyZoneDelta(workingState.zones, canonicalState.zones);
    draftTokenStateIndex?.attachAsCanonical(canonicalState);
    return {
      state: canonicalState,
      depth,
      kind,
    };
  } catch (error) {
    const canonicalState = canonicalizeState(def, workingState, resolvedRuntime);
    draftTokenStateIndex?.applyZoneDelta(workingState.zones, canonicalState.zones);
    draftTokenStateIndex?.attachAsCanonical(canonicalState);
    return {
      state: canonicalState,
      depth,
      kind: 'failed',
      failureReason: truncateFailureReason(error),
    };
  }
};

export const __internal_for_tests = {
  applyPublishedDecisionInternalNoFinalHash,
};
