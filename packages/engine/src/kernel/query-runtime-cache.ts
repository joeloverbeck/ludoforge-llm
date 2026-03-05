import type { GameState } from './types.js';

export interface QueryRuntimeCache {
  getTokenZoneByTokenIdIndex(state: GameState): ReadonlyMap<string, string> | undefined;
  setTokenZoneByTokenIdIndex(state: GameState, value: ReadonlyMap<string, string>): void;
}

export function createQueryRuntimeCache(): QueryRuntimeCache {
  const tokenZoneByTokenIdIndexByState = new WeakMap<GameState, ReadonlyMap<string, string>>();

  return {
    getTokenZoneByTokenIdIndex: (state) => {
      return tokenZoneByTokenIdIndexByState.get(state);
    },
    setTokenZoneByTokenIdIndex: (state, value) => {
      tokenZoneByTokenIdIndexByState.set(state, new Map(value));
    },
  };
}
