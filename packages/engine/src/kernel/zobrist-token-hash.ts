/**
 * Incremental Zobrist hash helpers for token effect handlers.
 *
 * Token placements encode (tokenId, zoneId, slotIndex). Because slot indices
 * are positional (array index), moving/inserting/removing a single token can
 * shift neighbouring tokens' slots. These helpers XOR out all old placements
 * for affected zones and XOR in the new ones.
 */
import { zobristKey } from './zobrist.js';
import type { MutableGameState } from './state-draft.js';
import type { Token, ZobristFeature, ZobristTable } from './types.js';

type TokenPlacementFeature = Extract<ZobristFeature, { readonly kind: 'tokenPlacement' }>;

/** Build a tokenPlacement feature for the given token at the given zone and slot. */
const placementFeature = (
  tokenId: Token['id'],
  zoneId: string,
  slot: number,
): TokenPlacementFeature => ({
  kind: 'tokenPlacement',
  tokenId: tokenId as TokenPlacementFeature['tokenId'],
  zoneId: zoneId as TokenPlacementFeature['zoneId'],
  slot,
});

/**
 * XOR out all old token placements for a zone and XOR in all new ones.
 * Used when token arrays change (move, draw, create, destroy, shuffle, moveAll).
 *
 * No-op when `table` is undefined (graceful degradation without a Zobrist table).
 */
export const updateZoneTokenHash = (
  state: MutableGameState,
  table: ZobristTable | undefined,
  zoneId: string,
  oldTokens: readonly Token[],
  newTokens: readonly Token[],
): void => {
  if (table === undefined) return;
  for (let i = 0; i < oldTokens.length; i++) {
    state._runningHash ^= zobristKey(table, placementFeature(oldTokens[i]!.id, zoneId, i));
  }
  for (let i = 0; i < newTokens.length; i++) {
    state._runningHash ^= zobristKey(table, placementFeature(newTokens[i]!.id, zoneId, i));
  }
};
