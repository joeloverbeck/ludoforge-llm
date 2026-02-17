import type { PlayerId } from '@ludoforge/engine';

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

  getColor(factionId: string | null, playerId: PlayerId): string {
    const seed = factionId === null ? playerId : hashString(factionId);
    const paletteIndex = toPaletteIndex(seed, this.palette.length);
    return this.palette[paletteIndex]!;
  }
}
