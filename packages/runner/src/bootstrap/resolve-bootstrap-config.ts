import { assertValidatedGameDefInput, asPlayerId, type GameDef, type PlayerId } from '@ludoforge/engine/runtime';

import defaultBootstrapGameDef from './default-game-def.json';

const DEFAULT_BOOTSTRAP_SEED = 42;
const DEFAULT_BOOTSTRAP_PLAYER_ID = asPlayerId(0);

export interface BootstrapConfig {
  readonly seed: number;
  readonly playerId: PlayerId;
  readonly resolveGameDef: () => Promise<GameDef>;
}

export function resolveBootstrapConfig(search = resolveWindowSearch()): BootstrapConfig {
  const params = new URLSearchParams(search);
  const game = params.get('game');
  const seed = parseNonNegativeInteger(params.get('seed'), DEFAULT_BOOTSTRAP_SEED);
  const playerId = asPlayerId(parseNonNegativeInteger(params.get('player'), DEFAULT_BOOTSTRAP_PLAYER_ID));

  if (game === 'fitl') {
    return {
      seed,
      playerId,
      resolveGameDef: async () => {
        const fitlBootstrapGameDef = (await import('./fitl-game-def.json')).default;
        return assertValidatedGameDefInput(fitlBootstrapGameDef, 'FITL bootstrap fixture');
      },
    };
  }

  return {
    seed,
    playerId,
    resolveGameDef: async () => assertValidatedGameDefInput(defaultBootstrapGameDef, 'runner bootstrap fixture'),
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
