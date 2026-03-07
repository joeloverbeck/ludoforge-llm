import type { GameState, Token } from './types.js';

export interface TokenStateIndexEntry {
  readonly zoneId: string;
  readonly index: number;
  readonly token: Token;
  readonly occurrenceCount: number;
}

const tokenStateIndexByState = new WeakMap<GameState, ReadonlyMap<string, TokenStateIndexEntry>>();

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
        });
        continue;
      }
      index.set(tokenId, {
        ...existing,
        occurrenceCount: existing.occurrenceCount + 1,
      });
    }
  }
  return index;
}

export function getTokenStateIndex(state: GameState): ReadonlyMap<string, TokenStateIndexEntry> {
  const cached = tokenStateIndexByState.get(state);
  if (cached !== undefined) {
    return cached;
  }
  const built = buildTokenStateIndex(state);
  tokenStateIndexByState.set(state, built);
  return built;
}

export function getTokenStateIndexEntry(state: GameState, tokenId: string): TokenStateIndexEntry | undefined {
  return getTokenStateIndex(state).get(tokenId);
}
