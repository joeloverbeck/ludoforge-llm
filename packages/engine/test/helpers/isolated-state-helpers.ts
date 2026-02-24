import {
  createRng,
  initialState,
  initializeTurnFlowEligibilityState,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

export type IsolatedStateTurnOrderMode = 'preserve' | 'roundRobin';

export const clearAllZones = (state: GameState): GameState => ({
  ...state,
  zones: Object.fromEntries(Object.keys(state.zones).map((zoneId) => [zoneId, []])) as GameState['zones'],
});

export const makeIsolatedInitialState = (
  def: GameDef,
  seed: number,
  playerCount: number,
  options?: {
    readonly turnOrderMode?: IsolatedStateTurnOrderMode;
  },
): GameState => {
  const base = clearAllZones(initialState(def, seed, playerCount).state);
  const withResetRng: GameState = {
    ...base,
    rng: createRng(BigInt(seed)).state,
  };
  if (options?.turnOrderMode === 'roundRobin') {
    return {
      ...withResetRng,
      turnOrderState: { type: 'roundRobin' },
    };
  }
  return initializeTurnFlowEligibilityState(def, withResetRng);
};
