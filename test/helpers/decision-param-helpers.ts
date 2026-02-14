import { applyMove, legalChoices, type ApplyMoveResult, type GameDef, type GameState, type Move } from '../../src/kernel/index.js';

const MAX_DECISION_STEPS = 256;

export const normalizeDecisionParamsForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
): Move => {
  let currentMove = move;

  for (let step = 0; step < MAX_DECISION_STEPS; step += 1) {
    let request;
    try {
      request = legalChoices(def, state, currentMove);
    } catch {
      return currentMove;
    }
    if (request.kind !== 'pending') {
      return currentMove;
    }

    if (Object.prototype.hasOwnProperty.call(currentMove.params, request.decisionId)) {
      return currentMove;
    }

    if (!Object.prototype.hasOwnProperty.call(currentMove.params, request.name)) {
      return currentMove;
    }

    currentMove = {
      ...currentMove,
      params: {
        ...currentMove.params,
        [request.decisionId]: currentMove.params[request.name]!,
      },
    };
  }

  throw new Error(`normalizeDecisionParamsForMove exceeded MAX_DECISION_STEPS=${String(MAX_DECISION_STEPS)}`);
};

export const applyMoveWithResolvedDecisionIds = (
  def: GameDef,
  state: GameState,
  move: Move,
): ApplyMoveResult => {
  const normalized = normalizeDecisionParamsForMove(def, state, move);
  const withCompound = normalized.compound === undefined
    ? normalized
    : {
      ...normalized,
      compound: {
        ...normalized.compound,
        specialActivity: normalizeDecisionParamsForMove(def, state, normalized.compound.specialActivity),
      },
    };
  return applyMove(def, state, withCompound);
};
