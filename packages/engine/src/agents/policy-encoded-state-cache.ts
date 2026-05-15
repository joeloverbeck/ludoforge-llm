import type { EncodedState, EncodedStateLayout } from '../kernel/encoded-state/index.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { serializeGameState } from '../kernel/serde.js';
import type { GameState } from '../kernel/types.js';

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
};

const canonicalSerializedStateKey = (state: GameState): string =>
  stableStringify(serializeGameState(state));

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

  const serializedState = canonicalSerializedStateKey(state);
  const hashEntries = runtime.policyEncodedStateHashCache.get(state.stateHash) ?? [];
  const hashCached = hashEntries.find((entry) => entry.serializedState === serializedState)?.encodedState;
  if (hashCached !== undefined) {
    hashHitCount += 1;
    runtime.policyEncodedStateCache.set(state, hashCached);
    return hashCached;
  }

  missCount += 1;
  const encoded = build(state, layout);
  if (encoded === undefined) {
    return undefined;
  }
  runtime.policyEncodedStateCache.set(state, encoded);
  runtime.policyEncodedStateHashCache.set(state.stateHash, [
    ...hashEntries,
    { serializedState, encodedState: encoded },
  ]);
  return encoded;
}

export const __policyEncodedStateCache_internal_for_tests = {
  getObjectHitCount: (): number => objectHitCount,
  getHashHitCount: (): number => hashHitCount,
  getMissCount: (): number => missCount,
  resetCounts: (): void => {
    objectHitCount = 0;
    hashHitCount = 0;
    missCount = 0;
  },
};
