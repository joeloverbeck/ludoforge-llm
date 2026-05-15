import type { EncodedState, EncodedStateLayout } from '../kernel/encoded-state/index.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import type { GameState } from '../kernel/types.js';

const stableStringifyObjectCache = new WeakMap<object, string>();
let stableStringifyObjectHitCount = 0;
let stableStringifyObjectMissCount = 0;

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  const cached = stableStringifyObjectCache.get(value);
  if (cached !== undefined) {
    stableStringifyObjectHitCount += 1;
    return cached;
  }
  stableStringifyObjectMissCount += 1;
  let encoded: string;
  if (Array.isArray(value)) {
    encoded = `[${value.map(stableStringify).join(',')}]`;
  } else {
    encoded = `{${Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  stableStringifyObjectCache.set(value, encoded);
  return encoded;
};

const encodedStateProjectionKey = (state: GameState): string =>
  stableStringify({
    globalMarkers: state.globalMarkers,
    globalVars: state.globalVars,
    markers: state.markers,
    perPlayerVars: state.perPlayerVars,
    zoneVars: state.zoneVars,
    zones: state.zones,
  });

let objectHitCount = 0;
let hashHitCount = 0;
let missCount = 0;

export function resolvePolicyEncodedState(
  runtime: GameDefRuntime,
  state: GameState,
  layout: EncodedStateLayout,
  build: (state: GameState, layout: EncodedStateLayout) => EncodedState | undefined,
): EncodedState | undefined {
  const objectCached = runtime.policyEncodedStateCache.get(state);
  if (objectCached !== undefined) {
    objectHitCount += 1;
    return objectCached;
  }

  const projectionKey = encodedStateProjectionKey(state);
  const projectionCached = runtime.policyEncodedStateProjectionCache.get(projectionKey);
  if (projectionCached !== undefined) {
    hashHitCount += 1;
    runtime.policyEncodedStateCache.set(state, projectionCached);
    return projectionCached;
  }

  missCount += 1;
  const encoded = build(state, layout);
  if (encoded === undefined) {
    return undefined;
  }
  runtime.policyEncodedStateCache.set(state, encoded);
  runtime.policyEncodedStateProjectionCache.set(projectionKey, encoded);
  return encoded;
}

export const __policyEncodedStateCache_internal_for_tests = {
  getObjectHitCount: (): number => objectHitCount,
  getHashHitCount: (): number => hashHitCount,
  getMissCount: (): number => missCount,
  getStableStringifyObjectHitCount: (): number => stableStringifyObjectHitCount,
  getStableStringifyObjectMissCount: (): number => stableStringifyObjectMissCount,
  resetCounts: (): void => {
    objectHitCount = 0;
    hashHitCount = 0;
    missCount = 0;
    stableStringifyObjectHitCount = 0;
    stableStringifyObjectMissCount = 0;
  },
};
