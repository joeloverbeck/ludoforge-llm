import type { GameState, Token } from './types.js';

export interface TokenStateIndexEntry {
  readonly zoneId: string;
  readonly index: number;
  readonly token: Token;
  readonly occurrenceCount: number;
  readonly occurrenceZoneIds: readonly string[];
}

const NO_DUPLICATE_OCCURRENCE_ZONE_IDS: readonly string[] = Object.freeze([]);

const tokenStateIndexByZones = new WeakMap<GameState['zones'], ReadonlyMap<string, TokenStateIndexEntry>>();

function buildTokenStateIndex(state: GameState): ReadonlyMap<string, TokenStateIndexEntry> {
  const index = new Map<string, TokenStateIndexEntry>();
  for (const [zoneId, tokens] of Object.entries(state.zones)) {
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      const token = tokens[tokenIndex];
      if (token === undefined) {
        continue;
      }
      const tokenId = String(token.id);
      const existing = index.get(tokenId);
      if (existing === undefined) {
        index.set(tokenId, {
          zoneId,
          index: tokenIndex,
          token,
          occurrenceCount: 1,
          occurrenceZoneIds: NO_DUPLICATE_OCCURRENCE_ZONE_IDS,
        });
        continue;
      }
      index.set(tokenId, {
        ...existing,
        occurrenceCount: existing.occurrenceCount + 1,
        occurrenceZoneIds: existing.occurrenceCount === 1
          ? [existing.zoneId, zoneId]
          : [...existing.occurrenceZoneIds, zoneId],
      });
    }
  }
  return index;
}

export function getTokenStateIndex(state: GameState): ReadonlyMap<string, TokenStateIndexEntry> {
  const cached = tokenStateIndexByZones.get(state.zones);
  if (cached !== undefined) {
    return cached;
  }
  const built = buildTokenStateIndex(state);
  tokenStateIndexByZones.set(state.zones, built);
  return built;
}

export function getTokenStateIndexEntry(state: GameState, tokenId: string): TokenStateIndexEntry | undefined {
  return getTokenStateIndex(state).get(tokenId);
}

/**
 * Invalidate the cached token-state index for a GameState.
 * Must be called after mutable zone mutations so that subsequent
 * lookups rebuild the index from the (now-mutated) zone arrays.
 */
export function invalidateTokenStateIndex(state: GameState): void {
  tokenStateIndexByZones.delete(state.zones);
}
