import { ensureActionUsageCloned, type DraftTracker, type MutableGameState } from './state-draft.js';
import type { ActionDef, GameState } from './types.js';

export const resetTurnUsage = (state: GameState, tracker?: DraftTracker): GameState => {
  if (tracker !== undefined) {
    const mutableState = state as MutableGameState;
    ensureActionUsageCloned(mutableState, tracker);
    const mutableActionUsage = mutableState.actionUsage as Record<string, GameState['actionUsage'][string]>;
    for (const [actionId, usage] of Object.entries(mutableActionUsage)) {
      mutableActionUsage[actionId] = { ...usage, turnCount: 0 };
    }
    return mutableState;
  }

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

export const resetPhaseUsage = (state: GameState, tracker?: DraftTracker): GameState => {
  if (tracker !== undefined) {
    const mutableState = state as MutableGameState;
    ensureActionUsageCloned(mutableState, tracker);
    const mutableActionUsage = mutableState.actionUsage as Record<string, GameState['actionUsage'][string]>;
    for (const [actionId, usage] of Object.entries(mutableActionUsage)) {
      mutableActionUsage[actionId] = { ...usage, phaseCount: 0 };
    }
    return mutableState;
  }

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

export const incrementActionUsage = (
  state: GameState,
  actionId: ActionDef['id'],
  tracker?: DraftTracker,
): GameState => {
  const usage = state.actionUsage[String(actionId)] ?? { turnCount: 0, phaseCount: 0, gameCount: 0 };

  if (tracker !== undefined) {
    const mutableState = state as MutableGameState;
    ensureActionUsageCloned(mutableState, tracker);
    const mutableActionUsage = mutableState.actionUsage as Record<string, GameState['actionUsage'][string]>;
    mutableActionUsage[String(actionId)] = {
      turnCount: usage.turnCount + 1,
      phaseCount: usage.phaseCount + 1,
      gameCount: usage.gameCount + 1,
    };
    return mutableState;
  }

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
