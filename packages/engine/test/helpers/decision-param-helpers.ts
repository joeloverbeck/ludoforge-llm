import {
  applyMove,
  completeMoveDecisionSequence,
  nextInt,
  pickDeterministicChoiceValue,
  type ApplyMoveResult,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamValue,
  type Rng,
} from '../../src/kernel/index.js';

const MAX_DECISION_STEPS = 256;

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

const nextOccurrence = (map: Map<string, number>, key: string): number => {
  const next = (map.get(key) ?? 0) + 1;
  map.set(key, next);
  return next;
};

const deriveCanonicalBindingAlias = (name: string): string | null => {
  if (!name.startsWith('$__')) {
    return null;
  }
  const lastSeparator = name.lastIndexOf('__');
  if (lastSeparator < 0 || lastSeparator + 2 >= name.length) {
    return null;
  }
  const tail = name.slice(lastSeparator + 2);
  const sanitized = tail.startsWith('$') ? tail.slice(1) : tail;
  return sanitized.length > 0 ? `$${sanitized}` : null;
};

const resolveDecisionValue = (
  request: ChoicePendingRequest,
  move: Move,
  context: DecisionResolutionContext,
  options?: ResolveDecisionParamsOptions,
): MoveParamValue | undefined => {
  if (Object.prototype.hasOwnProperty.call(move.params, request.decisionId)) {
    return move.params[request.decisionId];
  }

  if (Object.prototype.hasOwnProperty.call(move.params, request.name)) {
    return move.params[request.name];
  }
  const canonicalAlias = deriveCanonicalBindingAlias(request.name);
  if (canonicalAlias !== null && Object.prototype.hasOwnProperty.call(move.params, canonicalAlias)) {
    return move.params[canonicalAlias];
  }

  const decisionOrdinal = nextOccurrence(context.byDecisionId, request.decisionId);
  const indexedDecisionIdKey = `${request.decisionId}#${decisionOrdinal}`;
  if (Object.prototype.hasOwnProperty.call(move.params, indexedDecisionIdKey)) {
    return move.params[indexedDecisionIdKey];
  }

  const nameOrdinal = nextOccurrence(context.byName, request.name);
  const indexedNameKey = `${request.name}#${nameOrdinal}`;
  if (Object.prototype.hasOwnProperty.call(move.params, indexedNameKey)) {
    return move.params[indexedNameKey];
  }
  if (canonicalAlias !== null) {
    const canonicalOrdinal = nextOccurrence(context.byName, canonicalAlias);
    const indexedCanonicalNameKey = `${canonicalAlias}#${canonicalOrdinal}`;
    if (Object.prototype.hasOwnProperty.call(move.params, indexedCanonicalNameKey)) {
      return move.params[indexedCanonicalNameKey];
    }
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

const normalizeDecisionParamsForMoveInternal = (
  def: GameDef,
  state: GameState,
  move: Move,
  preserveIncomplete: boolean,
  options?: ResolveDecisionParamsOptions,
): Move => {
  const resolutionContext: DecisionResolutionContext = {
    byDecisionId: new Map<string, number>(),
    byName: new Map<string, number>(),
  };
  let stochasticRng: Rng = options?.rng ?? { state: state.rng };
  const result = completeMoveDecisionSequence(def, state, move, {
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
    return result.move;
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
