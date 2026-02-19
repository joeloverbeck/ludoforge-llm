import { assertValidatedGameDefInput, asPlayerId, type GameDef, type PlayerId } from '@ludoforge/engine/runtime';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';

import { resolveBootstrapDescriptor } from './bootstrap-registry';

export interface BootstrapConfig {
  readonly seed: number;
  readonly playerId: PlayerId;
  readonly resolveGameDef: () => Promise<GameDef>;
  readonly visualConfigProvider: VisualConfigProvider;
}

export function resolveBootstrapConfig(search = resolveWindowSearch()): BootstrapConfig {
  const params = new URLSearchParams(search);
  const descriptor = resolveBootstrapDescriptor(params.get('game'));
  const seed = parseNonNegativeInteger(params.get('seed'), descriptor.defaultSeed);
  const playerId = asPlayerId(parseNonNegativeInteger(params.get('player'), descriptor.defaultPlayerId));

  return {
    seed,
    playerId,
    visualConfigProvider: descriptor.resolveVisualConfigProvider(),
    resolveGameDef: async () => {
      const gameDefInput = await descriptor.resolveGameDefInput();
      return assertValidatedGameDefInput(gameDefInput, descriptor.sourceLabel);
    },
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
