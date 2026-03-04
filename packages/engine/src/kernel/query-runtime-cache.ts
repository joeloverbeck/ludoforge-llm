import type { GameState } from './types.js';

export type QueryRuntimeCacheIndexKey = 'tokenZoneByTokenId';

interface QueryRuntimeCacheIndexValueByKey {
  readonly tokenZoneByTokenId: ReadonlyMap<string, string>;
}

type QueryRuntimeCacheIndexValue = QueryRuntimeCacheIndexValueByKey[QueryRuntimeCacheIndexKey];
type QueryRuntimeIndexesByState = Map<QueryRuntimeCacheIndexKey, QueryRuntimeCacheIndexValue>;

export interface QueryRuntimeCache {
  getIndex<K extends QueryRuntimeCacheIndexKey>(state: GameState, key: K): QueryRuntimeCacheIndexValueByKey[K] | undefined;
  setIndex<K extends QueryRuntimeCacheIndexKey>(state: GameState, key: K, value: QueryRuntimeCacheIndexValueByKey[K]): void;
}

export function createQueryRuntimeCache(): QueryRuntimeCache {
  const indexesByState = new WeakMap<GameState, QueryRuntimeIndexesByState>();

  const getStateIndexes = (state: GameState): QueryRuntimeIndexesByState => {
    const existing = indexesByState.get(state);
    if (existing !== undefined) {
      return existing;
    }
    const created = new Map<QueryRuntimeCacheIndexKey, QueryRuntimeCacheIndexValue>();
    indexesByState.set(state, created);
    return created;
  };

  return {
    getIndex: (state, key) => {
      const indexes = indexesByState.get(state);
      const value = indexes?.get(key);
      return value as QueryRuntimeCacheIndexValueByKey[typeof key] | undefined;
    },
    setIndex: (state, key, value) => {
      const indexes = getStateIndexes(state);
      indexes.set(key, value);
    },
  };
}

