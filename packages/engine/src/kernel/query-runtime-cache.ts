import type { GameState } from './types.js';

export const QUERY_RUNTIME_CACHE_INDEX_KEYS = {
  tokenZoneByTokenId: 'tokenZoneByTokenId',
} as const;
export type QueryRuntimeCacheIndexKey = (typeof QUERY_RUNTIME_CACHE_INDEX_KEYS)[keyof typeof QUERY_RUNTIME_CACHE_INDEX_KEYS];

interface QueryRuntimeCacheIndexValueByKey {
  readonly [QUERY_RUNTIME_CACHE_INDEX_KEYS.tokenZoneByTokenId]: ReadonlyMap<string, string>;
}

type QueryRuntimeCacheIndexValue = QueryRuntimeCacheIndexValueByKey[QueryRuntimeCacheIndexKey];
type QueryRuntimeIndexesByState = Map<QueryRuntimeCacheIndexKey, QueryRuntimeCacheIndexValue>;

export interface QueryRuntimeCache {
  getIndex<K extends QueryRuntimeCacheIndexKey>(state: GameState, key: K): QueryRuntimeCacheIndexValueByKey[K] | undefined;
  setIndex<K extends QueryRuntimeCacheIndexKey>(state: GameState, key: K, value: QueryRuntimeCacheIndexValueByKey[K]): void;
}

export function getTokenZoneByTokenIdIndex(
  cache: QueryRuntimeCache,
  state: GameState,
): ReadonlyMap<string, string> | undefined {
  return cache.getIndex(state, QUERY_RUNTIME_CACHE_INDEX_KEYS.tokenZoneByTokenId);
}

export function setTokenZoneByTokenIdIndex(
  cache: QueryRuntimeCache,
  state: GameState,
  value: ReadonlyMap<string, string>,
): void {
  cache.setIndex(state, QUERY_RUNTIME_CACHE_INDEX_KEYS.tokenZoneByTokenId, value);
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
