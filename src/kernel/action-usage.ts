import type { GameState } from './types.js';

export const resetTurnUsage = (state: GameState): GameState => {
  const actionUsage = Object.fromEntries(
    Object.entries(state.actionUsage).map(([actionId, usage]) => [
      actionId,
      { ...usage, turnCount: 0 },
    ]),
  );

  return {
    ...state,
    actionUsage,
  };
};

export const resetPhaseUsage = (state: GameState): GameState => {
  const actionUsage = Object.fromEntries(
    Object.entries(state.actionUsage).map(([actionId, usage]) => [
      actionId,
      { ...usage, phaseCount: 0 },
    ]),
  );

  return {
    ...state,
    actionUsage,
  };
};
