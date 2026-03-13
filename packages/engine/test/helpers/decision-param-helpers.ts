import {
  applyMove,
  completeMoveDecisionSequence,
  nextInt,
  pickDeterministicChoiceValue,
  resolveMoveDecisionSequence,
  type ApplyMoveResult,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamValue,
  type Rng,
} from '../../src/kernel/index.js';
import {
  consumeDecisionOccurrence,
  createDecisionOccurrenceContext,
  resolveMoveParamForDecisionOccurrence,
} from '../../src/kernel/decision-occurrence.js';

const MAX_DECISION_STEPS = 256;
const INDEXED_DECISION_KEY_PATTERN = /^decision:.*#\d+$/;

export interface DecisionOverrideRule {
  readonly when: (request: ChoicePendingRequest) => boolean;
  readonly value: MoveParamValue | ((request: ChoicePendingRequest) => MoveParamValue | undefined);
}

export interface ResolveDecisionParamsOptions {
  readonly overrides?: readonly DecisionOverrideRule[];
  readonly maxDecisionProbeSteps?: number;
  readonly rng?: Rng;
}

interface DecisionResolutionContext {
  readonly byDecisionId: Map<string, number>;
  readonly byName: Map<string, number>;
}

const deterministicDefault = (request: ChoicePendingRequest): MoveParamValue | undefined => {
  return pickDeterministicChoiceValue(request);
};

const resolveDecisionValue = (
  request: ChoicePendingRequest,
  move: Move,
  context: DecisionResolutionContext,
  options?: ResolveDecisionParamsOptions,
): MoveParamValue | undefined => {
  const occurrence = consumeDecisionOccurrence(context, request.decisionId, request.name);
  const fromMove = resolveMoveParamForDecisionOccurrence(move.params, occurrence);
  if (fromMove !== undefined) {
    return fromMove;
  }

  for (const rule of options?.overrides ?? []) {
    if (!rule.when(request)) {
      continue;
    }
    const overridden = typeof rule.value === 'function' ? rule.value(request) : rule.value;
    if (overridden !== undefined) {
      return overridden;
    }
  }

  return deterministicDefault(request);
};

const formatResolutionFailure = (move: Move, result: ReturnType<typeof completeMoveDecisionSequence>): string => {
  if (result.nextDecision !== undefined) {
    const decision = result.nextDecision;
    return `unresolved decisionId=${decision.decisionId} name=${decision.name} type=${decision.type} options=${decision.options.length} min=${decision.min ?? 0}`;
  }
  if (result.illegal !== undefined) {
    return `illegal=${result.illegal.reason}`;
  }
  return 'decision probing did not complete';
};

const stripStochasticOnlyBindings = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  resolvedMove: Move,
  maxDecisionProbeSteps: number,
): Move => {
  const baseKeys = new Set(Object.keys(baseMove.params));
  const addedKeys = Object.keys(resolvedMove.params).filter((key) => !baseKeys.has(key));
  if (addedKeys.length === 0) {
    return resolvedMove;
  }
  const stochasticKeys = addedKeys.filter((key) => key.startsWith('$'));
  if (stochasticKeys.length === 0) {
    return resolvedMove;
  }
  const params = { ...resolvedMove.params };
  for (const key of stochasticKeys) {
    delete params[key];
  }
  const candidateMove: Move = {
    ...resolvedMove,
    params,
  };
  const viabilityProbe = resolveMoveDecisionSequence(def, state, candidateMove, {
    budgets: { maxDecisionProbeSteps },
    choose: () => undefined,
  });
  if (viabilityProbe.complete || (viabilityProbe.stochasticDecision !== undefined && (viabilityProbe.nextDecisionSet?.length ?? 0) === 0)) {
    return candidateMove;
  }
  return resolvedMove;
};

const normalizeDecisionParamsForMoveInternal = (
  def: GameDef,
  state: GameState,
  move: Move,
  preserveIncomplete: boolean,
  options?: ResolveDecisionParamsOptions,
): Move => {
  const hintedMove: Move = {
    ...move,
    params: Object.fromEntries(
      Object.entries(move.params).filter(
        ([key]) => !key.startsWith('$') && !INDEXED_DECISION_KEY_PATTERN.test(key),
      ),
    ),
  };
  const resolutionContext: DecisionResolutionContext = {
    ...createDecisionOccurrenceContext(),
  };
  let stochasticRng: Rng = options?.rng ?? { state: state.rng };
  const result = completeMoveDecisionSequence(def, state, hintedMove, {
    budgets: {
      maxDecisionProbeSteps: options?.maxDecisionProbeSteps ?? MAX_DECISION_STEPS,
    },
    choose: (request) => resolveDecisionValue(request, move, resolutionContext, options),
    chooseStochastic: (request) => {
      if (request.outcomes.length === 0) {
        return undefined;
      }
      const [index, nextRng] = nextInt(stochasticRng, 0, request.outcomes.length - 1);
      stochasticRng = nextRng;
      return request.outcomes[index]?.bindings;
    },
  });
  if (result.complete) {
    return stripStochasticOnlyBindings(
      def,
      state,
      hintedMove,
      result.move,
      options?.maxDecisionProbeSteps ?? MAX_DECISION_STEPS,
    );
  }
  if (result.illegal !== undefined) {
    // Keep canonical illegal-move behavior for callers that assert applyMove failures.
    return move;
  }
  if (preserveIncomplete) {
    return move;
  }
  throw new Error(
    `Could not normalize decision params for actionId=${String(move.actionId)}: ${formatResolutionFailure(move, result)}`,
  );
};

export const normalizeDecisionParamsForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: ResolveDecisionParamsOptions,
): Move => normalizeDecisionParamsForMoveInternal(def, state, move, false, options);

export const applyMoveWithResolvedDecisionIds = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: ResolveDecisionParamsOptions,
): ApplyMoveResult => {
  const normalized = normalizeDecisionParamsForMoveInternal(def, state, move, false, options);
  const withCompound = normalized.compound === undefined
    ? normalized
    : (() => {
      const { compound, ...operationMove } = normalized;
      // When replaceRemainingStages is true, the SA runs mid-operation (after insertAfterStage),
      // not after all operation stages. Running the full operation here would produce a state where
      // later stages have already mutated the board (e.g. attack combat activates guerrillas),
      // making SA option domains invalid. Use the original state as the best approximation of the
      // mid-operation state for SA decision normalization.
      // Preserve the original activePlayer for SA resolution. The standalone operation
      // applyMove may advance the turn and change activePlayer, but compound moves are
      // a single turn action — the SA must resolve with the same player context.
      const saResolutionState = compound.replaceRemainingStages === true
        ? state
        : { ...applyMove(def, state, operationMove).state, activePlayer: state.activePlayer };
      return {
        ...normalized,
        compound: {
          ...compound,
          // Resolve SA choices from post-operation (or pre-operation for replaceRemainingStages)
          // state so legal domains reflect the state the SA will actually execute in.
          // Preserve incomplete SA params so applyMove continues to own compound legality diagnostics.
          specialActivity: normalizeDecisionParamsForMoveInternal(
            def,
            saResolutionState,
            compound.specialActivity,
            true,
            options,
          ),
        },
      };
    })();
  return applyMove(def, state, withCompound);
};
