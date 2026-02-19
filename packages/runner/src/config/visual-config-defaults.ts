export type ZoneShape =
  | 'rectangle'
  | 'circle'
  | 'hexagon'
  | 'diamond'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'octagon';

export type TokenShape =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'diamond'
  | 'hexagon'
  | 'beveled-cylinder'
  | 'meeple'
  | 'card'
  | 'cube'
  | 'round-disk';

export const DEFAULT_ZONE_SHAPE: ZoneShape = 'rectangle';
export const DEFAULT_ZONE_WIDTH = 160;
export const DEFAULT_ZONE_HEIGHT = 100;

export const DEFAULT_TOKEN_SHAPE: TokenShape = 'circle';
export const DEFAULT_TOKEN_SIZE = 28;

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

export function computeDefaultFactionColor(factionId: string): string {
  const seed = hashString(factionId);
  const index = toPaletteIndex(seed, DEFAULT_FACTION_PALETTE.length);
  return DEFAULT_FACTION_PALETTE[index]!;
}
