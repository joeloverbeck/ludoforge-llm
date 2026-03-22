import { nextInt } from '../kernel/prng.js';
import type { Rng, TrustedExecutableMove } from '../kernel/types.js';

export const pickRandom = <T>(
  items: readonly T[],
  rng: Rng,
): { readonly item: T; readonly rng: Rng } => {
  if (items.length === 0) {
    throw new Error('pickRandom requires at least one item');
  }
  if (items.length === 1) {
    return { item: items[0]!, rng };
  }

  const [index, nextRng] = nextInt(rng, 0, items.length - 1);
  const item = items[index];
  if (item === undefined) {
    throw new Error(`pickRandom selected out-of-range index ${index}`);
  }
  return { item, rng: nextRng };
};

export const selectStochasticFallback = (
  stochasticMoves: readonly TrustedExecutableMove[],
  rng: Rng,
): { readonly move: TrustedExecutableMove; readonly rng: Rng } => {
  const { item: move, rng: nextRng } = pickRandom(stochasticMoves, rng);
  return { move, rng: nextRng };
};
