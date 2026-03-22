import { findBootstrapDescriptorByQueryValue } from './bootstrap-registry.js';

export interface BrowserBootstrapEntryRequest {
  readonly gameId: string;
  readonly seed: number;
  readonly playerId: number;
}

export function resolveBrowserBootstrapEntryRequest(
  search = resolveWindowSearch(),
): BrowserBootstrapEntryRequest | null {
  const params = new URLSearchParams(search);
  const game = params.get('game');
  if (game === null) {
    return null;
  }

  const descriptor = findBootstrapDescriptorByQueryValue(game);
  if (descriptor === null) {
    return null;
  }

  return {
    gameId: descriptor.id,
    seed: parseNonNegativeInteger(params.get('seed'), descriptor.defaultSeed),
    playerId: parseNonNegativeInteger(params.get('player'), descriptor.defaultPlayerId),
  };
}

function resolveWindowSearch(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.location.search;
}

function parseNonNegativeInteger(raw: string | null, fallback: number): number {
  if (raw === null || !/^\d+$/u.test(raw)) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    return fallback;
  }
  return value;
}
