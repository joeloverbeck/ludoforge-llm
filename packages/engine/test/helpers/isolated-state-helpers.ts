import {
  createRng,
  initialState,
  initializeTurnFlowEligibilityState,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

export type IsolatedStateTurnOrderMode = 'preserve' | 'roundRobin';

/**
 * Clears all token zones to empty arrays. Does NOT reset markers, zoneVars,
 * or scenario-defined marker states (e.g., supportOpposition defaults).
 * Production spaces retain their compiled marker defaults even after clearing.
 * When testing effects that shift markers, explicitly set marker states for
 * affected spaces.
 */
export const clearAllZones = (state: GameState): GameState => ({
  ...state,
  zones: Object.fromEntries(Object.keys(state.zones).map((zoneId) => [zoneId, []])) as GameState['zones'],
});

export const withNeutralSupportOppositionMarkers = (state: GameState): GameState['markers'] =>
  Object.fromEntries(
    Object.entries(state.markers).map(([zoneId, zoneMarkers]) => [
      zoneId,
      zoneMarkers?.supportOpposition === undefined
        ? zoneMarkers
        : { ...zoneMarkers, supportOpposition: 'neutral' },
    ]),
  ) as GameState['markers'];

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
