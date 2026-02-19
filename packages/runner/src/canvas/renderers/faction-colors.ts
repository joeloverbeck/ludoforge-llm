import type { FactionDef, PlayerId, TokenTypeDef, TokenVisualHints } from '@ludoforge/engine/runtime';

import type { FactionColorProvider } from './renderer-types';

export const DEFAULT_FACTION_PALETTE = [
  '#e63946',
  '#457b9d',
  '#2a9d8f',
  '#e9c46a',
  '#6a4c93',
  '#1982c4',
  '#ff595e',
  '#8ac926',
] as const;

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

function hashString(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
}

function toPaletteIndex(seed: number, paletteSize: number): number {
  return ((seed % paletteSize) + paletteSize) % paletteSize;
}

export class DefaultFactionColorProvider implements FactionColorProvider {
  private readonly palette = DEFAULT_FACTION_PALETTE;

  getTokenTypeVisual(_tokenTypeId: string): TokenVisualHints | null {
    return null;
  }

  getColor(factionId: string | null, playerId: PlayerId): string {
    const seed = factionId === null ? playerId : hashString(factionId);
    const paletteIndex = toPaletteIndex(seed, this.palette.length);
    return this.palette[paletteIndex]!;
  }
}

export class GameDefFactionColorProvider implements FactionColorProvider {
  private colorByFaction = new Map<string, string>();
  private visualByTokenType = new Map<string, TokenVisualHints>();
  private readonly fallback: FactionColorProvider;

  constructor(factions: readonly FactionDef[] | undefined, fallback?: FactionColorProvider) {
    this.fallback = fallback ?? new DefaultFactionColorProvider();
    this.setFactions(factions);
  }

  setFactions(factions: readonly FactionDef[] | undefined): void {
    this.colorByFaction = new Map((factions ?? []).map((faction) => [faction.id, faction.color]));
  }

  setTokenTypes(tokenTypes: readonly TokenTypeDef[] | undefined): void {
    this.visualByTokenType = new Map(
      (tokenTypes ?? [])
        .map((tokenType) => {
          return tokenType.visual === undefined ? null : ([tokenType.id, tokenType.visual] as const);
        })
        .filter((entry): entry is readonly [string, TokenVisualHints] => entry !== null),
    );
  }

  getTokenTypeVisual(tokenTypeId: string): TokenVisualHints | null {
    return this.visualByTokenType.get(tokenTypeId) ?? this.fallback.getTokenTypeVisual(tokenTypeId);
  }

  getColor(factionId: string | null, playerId: PlayerId): string {
    if (factionId !== null) {
      const color = this.colorByFaction.get(factionId);
      if (color !== undefined) {
        return color;
      }
    }

    return this.fallback.getColor(factionId, playerId);
  }
}
