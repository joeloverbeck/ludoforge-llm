import { isDeepStrictEqual } from 'node:util';
import { createRng, deserialize, serialize, stepRng } from './prng.js';
import { deserializeGameState, serializeGameState } from './serde.js';
import type { GameState, Rng } from './types.js';

const formatValue = (value: unknown): string => {
  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  return String(value);
};

export const assertDeterministic = <T>(
  fn: (rng: Rng) => T,
  seed: bigint,
  compare: (a: T, b: T) => boolean = (a, b) => isDeepStrictEqual(a, b),
): void => {
  const first = fn(createRng(seed));
  const second = fn(createRng(seed));

  if (!compare(first, second)) {
    throw new Error(`Determinism assertion failed for seed ${seed.toString()}n`);
  }
};

export const assertRngRoundTrip = (rng: Rng, steps: number): void => {
  if (!Number.isSafeInteger(steps) || steps < 0) {
    throw new RangeError(`steps must be a non-negative safe integer, received ${steps}`);
  }

  let baseline = deserialize(serialize(rng));
  let restored = deserialize(serialize(rng));

  for (let index = 0; index < steps; index += 1) {
    const [expected, nextBaseline] = stepRng(baseline);
    const [actual, nextRestored] = stepRng(restored);

    if (expected !== actual) {
      throw new Error(
        `RNG round-trip mismatch at draw ${index}: expected=${formatValue(expected)} actual=${formatValue(actual)}`,
      );
    }

    baseline = nextBaseline;
    restored = nextRestored;
  }
};

export const assertStateRoundTrip = (state: GameState): void => {
  const serialized = serializeGameState(state);
  const roundTripped = deserializeGameState(serialized);

  if (!isDeepStrictEqual(roundTripped, state)) {
    throw new Error('State round-trip mismatch after serialize/deserialize');
  }

  const reserialized = serializeGameState(roundTripped);
  if (!isDeepStrictEqual(reserialized, serialized)) {
    throw new Error('State serialization is not stable across round-trip');
  }
};
