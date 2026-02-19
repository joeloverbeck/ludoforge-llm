import { assertValidatedGameDefInput, asPlayerId, type GameDef, type PlayerId } from '@ludoforge/engine/runtime';
import {
  buildRefValidationContext,
  parseVisualConfigStrict,
  validateVisualConfigRefs,
  VisualConfigProvider,
} from '../config/index.js';

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
  const rawVisualConfig = descriptor.resolveVisualConfigYaml();
  const parsedVisualConfig = parseVisualConfigStrict(rawVisualConfig);
  const visualConfigProvider = new VisualConfigProvider(parsedVisualConfig);

  return {
    seed,
    playerId,
    visualConfigProvider,
    resolveGameDef: async () => {
      const gameDefInput = await descriptor.resolveGameDefInput();
      const gameDef = assertValidatedGameDefInput(gameDefInput, descriptor.sourceLabel);
      const context = buildRefValidationContext(gameDef);
      const errors = parsedVisualConfig === null ? [] : validateVisualConfigRefs(parsedVisualConfig, context);
      if (errors.length > 0) {
        const message = errors
          .map((error) => `${error.configPath} -> "${error.referencedId}" (${error.message})`)
          .join('\n');
        throw new Error(`Invalid visual config references:\n${message}`);
      }
      return gameDef;
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
