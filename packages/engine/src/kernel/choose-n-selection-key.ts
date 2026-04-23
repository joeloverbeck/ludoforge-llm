import { optionKey } from './legal-choices.js';
import type { MoveParamScalar } from './types.js';

/**
 * A canonical set key for chooseN probe and legality caches.
 *
 * - For domains up to 64 options: bigint bitset (set bit per option's
 *   domain index). Efficient equality and hashing.
 * - For larger domains: sorted domain indices joined by ",".
 *
 * Both forms are bounded by domain structure rather than raw option payload
 * size. Public selected order remains unchanged.
 */
export type SelectionKey = bigint | string;

const MAX_BITSET_DOMAIN_SIZE = 64;

/**
 * Deterministic: same selected set (regardless of order) -> same key.
 */
export const toSelectionKey = (
  domainIndex: ReadonlyMap<string, number>,
  selected: readonly MoveParamScalar[],
): SelectionKey => {
  if (domainIndex.size <= MAX_BITSET_DOMAIN_SIZE) {
    let bits = 0n;
    for (const value of selected) {
      const idx = domainIndex.get(optionKey(value));
      if (idx !== undefined) {
        bits |= 1n << BigInt(idx);
      }
    }
    return bits;
  }

  return selected
    .map((value) => domainIndex.get(optionKey(value)))
    .filter((idx): idx is number => idx !== undefined)
    .sort((left, right) => left - right)
    .join(',');
};
