import type { ActionDef, GameState } from './types.js';

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

export const incrementActionUsage = (state: GameState, actionId: ActionDef['id']): GameState => {
  const usage = state.actionUsage[String(actionId)] ?? { turnCount: 0, phaseCount: 0, gameCount: 0 };

  return {
    ...state,
    actionUsage: {
      ...state.actionUsage,
      [String(actionId)]: {
        turnCount: usage.turnCount + 1,
        phaseCount: usage.phaseCount + 1,
        gameCount: usage.gameCount + 1,
      },
    },
  };
};
