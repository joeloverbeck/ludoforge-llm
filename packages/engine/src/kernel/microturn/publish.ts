import { asPlayerId, type SeatId } from '../branded.js';
import { canConfirmChooseNSelection } from '../choose-n-cardinality.js';
import { computeTierAdmissibility } from '../prioritized-tier-legality.js';
import type { ChooseNTemplate } from '../choose-n-session.js';
import { createGameDefRuntime, type GameDefRuntime } from '../gamedef-runtime.js';
import type { DecisionKey } from '../decision-scope.js';
import { enumerateLegalMoves } from '../legal-moves.js';
import { evaluateMoveLegality } from '../move-legality-predicate.js';
import { probeMoveViability } from '../apply-move.js';
import { MISSING_BINDING_POLICY_CONTEXTS } from '../missing-binding-policy.js';
import { derivePlayerObservation } from '../observation.js';
import type {
  ActionDef,
  ChoiceOption,
  ChoicePendingRequest,
  GameDef,
  GameState,
  Move,
} from '../types-core.js';
import type { MoveParamScalar } from '../types-ast.js';
import { computeFullHash, createZobristTable } from '../zobrist.js';
import {
  classifyDecisionContinuationAdmissionForLegalMove,
  resolveDecisionContinuation,
  type DecisionContinuationResult,
} from './continuation.js';
import { isBridgeableNextDecision, MICROTURN_PROBE_DEPTH_BUDGET } from './probe.js';
import { resumeSuspendedEffectFrame } from './resume.js';
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
  type SuspendedEffectFrameSnapshot,
  type StochasticResolveContext,
  type StochasticResolveDecision,
  type TurnRetirementContext,
  type TurnRetirementDecision,
} from './types.js';

const microturnConstructibilityInvariant = (detail: string): Error =>
  new Error(`MICROTURN_CONSTRUCTIBILITY_INVARIANT: ${detail}`);

const microturnContextKindUnsupported = (kind: string): Error =>
  new Error(`MICROTURN_CONTEXT_KIND_UNSUPPORTED:${kind}`);

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

const publicationContinuationContext = (move: Move): typeof MISSING_BINDING_POLICY_CONTEXTS[keyof typeof MISSING_BINDING_POLICY_CONTEXTS] =>
  move.freeOperation === true
    ? MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE
    : MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_PLAIN_ACTION_DECISION_SEQUENCE;

const isPublishedMoveAdmitted = (
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
): boolean => {
  if (move.freeOperation !== true) {
    return true;
  }
  const classification = classifyDecisionContinuationAdmissionForLegalMove(
    def,
    state,
    move,
    publicationContinuationContext(move),
    {
      validateSatisfiedMove: (candidateMove) => evaluateMoveLegality(def, state, candidateMove, runtime).kind === 'legal',
    },
    runtime,
  );
  return classification === 'satisfiable' || classification === 'explicitStochastic';
};

const isSupportedActionMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
): boolean => {
  try {
    const continuation = resolveContinuationForMove(def, state, move, runtime);
    return isSupportedContinuationResult(def, state, move, continuation, runtime);
  } catch {
    return false;
  }
};

const isSupportedContinuationResult = (
  def: GameDef,
  state: GameState,
  move: Move,
  continuation: DecisionContinuationResult,
  runtime?: GameDefRuntime,
): boolean => {
  if (continuation.illegal !== undefined) {
    return false;
  }
  if (!isPublishedMoveAdmitted(def, state, move, runtime)) {
    return false;
  }
  const moveViability = probeMoveViability(def, state, move, runtime);
  if (continuation.stochasticDecision !== undefined) {
    return toStochasticDistribution(continuation) !== null;
  }
  if (continuation.nextDecision === undefined) {
    return continuation.complete && moveViability.viable;
  }
  if (
    !moveViability.viable
    && moveViability.code === 'ILLEGAL_MOVE'
    && moveViability.context.reason !== 'moveHasIncompleteParams'
  ) {
    return false;
  }
  return isBridgeableNextDecision(
    {
      def,
      state,
      runtime: getRuntime(def, runtime),
      move,
      depthBudget: MICROTURN_PROBE_DEPTH_BUDGET,
    },
    continuation.nextDecision,
  );
};

const isSupportedFrameContinuationMove = (
  def: GameDef,
  state: GameState,
  effectFrame: EffectExecutionFrameSnapshot,
  move: Move,
  runtime?: GameDefRuntime,
): boolean => {
  const suspendedFrame: SuspendedEffectFrameSnapshot | undefined = effectFrame.suspendedFrame;
  if (suspendedFrame === undefined) {
    return isSupportedActionMove(def, state, move, runtime);
  }
  try {
    const continuation = resumeSuspendedEffectFrame(def, suspendedFrame, move, runtime);
    return isSupportedContinuationResult(def, state, move, continuation, runtime);
  } catch {
    return false;
  }
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

const unavailableActionKey = (
  turnId: ReturnType<typeof actionSelectionTurnId>,
  seatId: SeatId,
): string => `${String(turnId)}:${String(seatId)}`;

const filterUnavailableActions = (
  state: GameState,
  moves: readonly Move[],
  turnId: ReturnType<typeof actionSelectionTurnId>,
  seatId: SeatId,
): readonly Move[] => {
  const unavailable = state.unavailableActionsPerTurn?.[unavailableActionKey(turnId, seatId)] ?? [];
  if (unavailable.length === 0) {
    return moves;
  }
  return moves.filter((move) => !unavailable.includes(move.actionId));
};

const actionById = (def: GameDef, actionId: Move['actionId']): ActionDef | undefined =>
  def.actions.find((action) => action.id === actionId);

const findPassFallbackMove = (
  def: GameDef,
  supportedMoves: readonly Move[],
): Move | undefined =>
  supportedMoves.find((move) => actionById(def, move.actionId)?.tags?.includes('pass') === true);

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
    ...(frame.continuationBindings ?? {}),
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
  template?: ChooseNTemplate,
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
  ...(template === undefined
    ? {}
    : {
      templateHint: {
        normalizedDomain: template.normalizedDomain,
        prioritizedTierEntries: template.prioritizedTierEntries,
        qualifierMode: template.qualifierMode,
      },
    }),
});

type AdvanceChooseNStepContextResult =
  | { readonly done: false; readonly nextContext: ChooseNStepContext }
  | { readonly done: true; readonly value: readonly MoveParamScalar[] };

const scalarKey = (value: MoveParamScalar): string => JSON.stringify([typeof value, value]);

const rebuildChooseNStepOptions = (
  context: ChooseNStepContext,
  nextSelected: readonly MoveParamScalar[],
): readonly ChoiceOption[] => {
  const domain = context.templateHint?.normalizedDomain
    ?? context.options.map((option) => option.value as MoveParamScalar);
  const selectedKeys = new Set(nextSelected.map((value) => scalarKey(value)));
  const hasAddCapacity = nextSelected.length < context.cardinality.max;
  const admissibleKeys = context.templateHint?.prioritizedTierEntries === null || context.templateHint === undefined
    ? null
    : new Set(
      computeTierAdmissibility(
        context.templateHint.prioritizedTierEntries,
        nextSelected,
        context.templateHint.qualifierMode,
      ).admissibleValues.map((value) => scalarKey(value)),
    );

  return domain.map((value) => {
    const key = scalarKey(value);
    const isSelected = selectedKeys.has(key);
    const isPrioritizedIllegal = admissibleKeys !== null && !admissibleKeys.has(key);
    const isStaticallyIllegal = isSelected || !hasAddCapacity || isPrioritizedIllegal;
    return {
      value,
      legality: isStaticallyIllegal ? 'illegal' as const : 'unknown' as const,
      illegalReason: null,
      ...(isStaticallyIllegal ? { resolution: 'exact' as const } : {}),
    };
  });
};

export const advanceChooseNStepContext = (
  context: ChooseNStepContext,
  decision: ChooseNStepDecision,
): AdvanceChooseNStepContextResult => {
  if (decision.command === 'confirm') {
    if (!context.stepCommands.includes('confirm')) {
      throw new Error('MICROTURN_CHOOSE_N_CONFIRM_NOT_AVAILABLE');
    }
    return { done: true, value: [...context.selectedSoFar] };
  }

  if (decision.value === undefined) {
    throw new Error('MICROTURN_CHOOSE_N_VALUE_REQUIRED');
  }

  const selectedKeys = new Set(context.selectedSoFar.map((value) => scalarKey(value)));
  const decisionKey = scalarKey(decision.value);

  if (decision.command === 'add') {
    if (selectedKeys.has(decisionKey)) {
      throw new Error('MICROTURN_CHOOSE_N_DUPLICATE_ADD');
    }
    const option = context.options.find((candidate) => scalarKey(candidate.value as MoveParamScalar) === decisionKey);
    if (option === undefined || option.legality === 'illegal') {
      throw new Error('MICROTURN_CHOOSE_N_ADD_NOT_LEGAL');
    }
    const nextSelected = [...context.selectedSoFar, decision.value];
    return {
      done: false,
      nextContext: {
        ...context,
        selectedSoFar: nextSelected,
        options: rebuildChooseNStepOptions(context, nextSelected),
        stepCommands: canConfirmChooseNSelection(
          nextSelected.length,
          context.cardinality.min,
          context.cardinality.max,
        ) ? ['add', 'remove', 'confirm'] : ['add', 'remove'],
      },
    };
  }

  if (!selectedKeys.has(decisionKey)) {
    throw new Error('MICROTURN_CHOOSE_N_REMOVE_NOT_SELECTED');
  }
  const nextSelected = context.selectedSoFar.filter((value) => scalarKey(value) !== decisionKey);
  return {
    done: false,
    nextContext: {
      ...context,
      selectedSoFar: nextSelected,
      options: rebuildChooseNStepOptions(context, nextSelected),
      stepCommands: canConfirmChooseNSelection(
        nextSelected.length,
        context.cardinality.min,
        context.cardinality.max,
      ) ? ['add', 'remove', 'confirm'] : ['add', 'remove'],
    },
  };
};

export const toChooseNStepDecisions = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  context: ChooseNStepContext,
  effectFrame: EffectExecutionFrameSnapshot,
  runtime?: GameDefRuntime,
): readonly ChooseNStepDecision[] => {
  const selectedKeys = new Set(context.selectedSoFar.map((value) => JSON.stringify([typeof value, value])));
  const decisions = context.options
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
  decisions.push(...removals);
  if (context.stepCommands.includes('confirm')) {
    decisions.push({
      kind: 'chooseNStep',
      decisionKey: context.decisionKey,
      command: 'confirm',
    });
  }
  return decisions.filter((decision) => {
    try {
      const advanced = advanceChooseNStepContext(context, decision);

      // Intermediate chooseN steps are executable if they produce another
      // valid pending chooseN frame in the current microturn context. Only the
      // terminal confirm step must additionally prove that the resulting move
      // continuation remains bridgeable as a supported action move.
      if (!advanced.done) {
        const nextSelectedKeys = new Set(
          advanced.nextContext.selectedSoFar.map((value) => JSON.stringify([typeof value, value])),
        );
        const hasRemainingAdd = advanced.nextContext.options.some((option) =>
          option.legality !== 'illegal'
          && !Array.isArray(option.value)
          && !nextSelectedKeys.has(JSON.stringify([typeof option.value, option.value])),
        );
        if (hasRemainingAdd) {
          return true;
        }
        if (!advanced.nextContext.stepCommands.includes('confirm')) {
          return false;
        }
        const candidateMove: Move = {
          ...baseMove,
          params: {
            ...baseMove.params,
            [context.decisionKey]: advanced.nextContext.selectedSoFar,
          },
        };
        return isSupportedFrameContinuationMove(
          def,
          state,
          effectFrame,
          candidateMove,
          runtime,
        );
      }

      const candidateMove: Move = {
        ...baseMove,
        params: {
          ...baseMove.params,
          [context.decisionKey]: advanced.value,
        },
      };
      return isSupportedFrameContinuationMove(
        def,
        state,
        effectFrame,
        candidateMove,
        runtime,
      );
    } catch {
      return false;
    }
  });
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
  const rawSupportedMoves = supportedActionMovesForState(def, state, runtime);
  const seatId = publishedSeatId(state, activeSeatForPlayer(def, state));
  const turnId = actionSelectionTurnId(state);
  const supportedMoves = filterUnavailableActions(state, rawSupportedMoves, turnId, seatId);
  const fallbackMove = findPassFallbackMove(def, rawSupportedMoves);
  const legalMoves = supportedMoves.length === 0 && fallbackMove !== undefined
    ? [fallbackMove]
    : supportedMoves;
  if (legalMoves.length === 0) {
    throw microturnConstructibilityInvariant('no simple actionSelection moves are currently bridgeable');
  }
  const decisionContext: ActionSelectionContext = {
    kind: 'actionSelection',
    seatId,
    eligibleActions: Array.from(new Set(legalMoves.map((move) => move.actionId))),
  };
  return {
    kind: decisionContext.kind,
    seatId,
    decisionContext,
    legalActions: toActionSelectionDecisions(legalMoves),
    projectedState: buildProjectedState(def, state, seatId),
    turnId,
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
    if (seatId === '__chance' || seatId === '__kernel') {
      throw microturnConstructibilityInvariant(`actionSelection context has unsupported seat ${seatId}`);
    }
    const allSupportedMoves = supportedActionMovesForState(def, state, runtime);
    const rawSupportedMoves = allSupportedMoves.filter((move) =>
      context.eligibleActions.includes(move.actionId),
    );
    const supportedMoves = filterUnavailableActions(state, rawSupportedMoves, top.turnId, seatId);
    const fallbackMove = findPassFallbackMove(def, allSupportedMoves);
    const legalMoves = supportedMoves.length === 0 && fallbackMove !== undefined
      ? [fallbackMove]
      : supportedMoves;
    const legalActions = toActionSelectionDecisions(legalMoves);
    if (legalActions.length === 0) {
      throw microturnConstructibilityInvariant('actionSelection context has no bridgeable continuations');
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
      .map((option) => ({
        decision: {
          kind: 'chooseOne',
          decisionKey: context.decisionKey,
          value: option.value,
        } as ChooseOneDecision,
        move: {
          ...baseMove,
          params: {
            ...baseMove.params,
            [context.decisionKey]: option.value,
          },
        },
      }))
      .filter(({ move }) => isSupportedFrameContinuationMove(def, state, top.effectFrame, move, runtime))
      .map(({ decision }) => decision);
    if (legalActions.length === 0) {
      throw microturnConstructibilityInvariant('chooseOne context has no bridgeable continuations');
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
    const baseMove = rebuildMoveFromFrame(root);
    const legalActions = toChooseNStepDecisions(def, state, baseMove, context, top.effectFrame, runtime);
    if (legalActions.length === 0) {
      throw microturnConstructibilityInvariant('chooseNStep context has no bridgeable continuations');
    }
    return {
      kind: 'chooseNStep',
      seatId,
      decisionContext: context,
      legalActions,
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
  throw microturnContextKindUnsupported(top.context.kind);
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
  effectFrame: createRootFrameSnapshot(history),
});

export const toDecisionStackContext = (
  request: ChoicePendingRequest,
  seatId: SeatId,
  chooseNTemplate?: ChooseNTemplate,
): ChooseOneContext | ChooseNStepContext =>
  request.type === 'chooseOne'
    ? toChooseOneContext(request, seatId)
    : toChooseNStepContext(request, seatId, chooseNTemplate);

export const toStochasticDecisionStackContext = (
  continuation: DecisionContinuationResult,
): StochasticResolveContext => {
  const stochastic = toStochasticDistribution(continuation);
  if (stochastic === null) {
    throw new Error(
      'MICROTURN_STOCHASTIC_DISTRIBUTION_REQUIRES_SINGLE_BIND: stochastic continuation does not expose a single-bind distribution',
    );
  }
  return toStochasticResolveContext(stochastic.decisionKey, stochastic.distribution);
};
