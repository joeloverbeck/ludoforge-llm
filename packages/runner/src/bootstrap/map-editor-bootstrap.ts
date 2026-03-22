import { assertValidatedGameDefInput, type GameDef } from '@ludoforge/engine/runtime';

import {
  buildRefValidationContext,
  parseVisualConfigStrict,
  validateVisualConfigRefs,
  VisualConfigProvider,
  type VisualConfig,
} from '../config/index.js';
import { partitionZones, resolveLayoutMode } from '../layout/build-layout-graph.js';
import {
  listBootstrapDescriptors,
  type BootstrapDescriptor,
} from './bootstrap-registry.js';

export interface MapEditorBootstrapCapabilities {
  readonly supportsMapEditor: boolean;
}

export interface ResolvedMapEditorBootstrap {
  readonly descriptor: BootstrapDescriptor;
  readonly gameDef: GameDef;
  readonly visualConfig: VisualConfig;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly capabilities: MapEditorBootstrapCapabilities;
}

const capabilityCache = new Map<string, Promise<MapEditorBootstrapCapabilities>>();
const bootstrapCache = new Map<string, Promise<ResolvedMapEditorBootstrap>>();

export async function resolveMapEditorBootstrapByGameId(
  gameId: string,
): Promise<ResolvedMapEditorBootstrap | null> {
  const descriptor = listBootstrapDescriptors().find((entry) => entry.id === gameId) ?? null;
  if (descriptor === null) {
    return null;
  }

  return resolveMapEditorBootstrap(descriptor);
}

export async function resolveMapEditorCapabilities(
  descriptor: BootstrapDescriptor,
): Promise<MapEditorBootstrapCapabilities> {
  const cached = capabilityCache.get(descriptor.id);
  if (cached !== undefined) {
    return cached;
  }

  const promise = resolveMapEditorBootstrap(descriptor).then((resolved) => resolved.capabilities);
  capabilityCache.set(descriptor.id, promise);
  return promise;
}

async function resolveMapEditorBootstrap(
  descriptor: BootstrapDescriptor,
): Promise<ResolvedMapEditorBootstrap> {
  const cached = bootstrapCache.get(descriptor.id);
  if (cached !== undefined) {
    return cached;
  }

  const promise = loadMapEditorBootstrap(descriptor);
  bootstrapCache.set(descriptor.id, promise);
  return promise;
}

async function loadMapEditorBootstrap(
  descriptor: BootstrapDescriptor,
): Promise<ResolvedMapEditorBootstrap> {
  const gameDefInput = await descriptor.resolveGameDefInput();
  const gameDef = assertValidatedGameDefInput(gameDefInput, descriptor.sourceLabel);
  const visualConfig = parseRequiredVisualConfig(descriptor);
  const errors = validateVisualConfigRefs(visualConfig, buildRefValidationContext(gameDef));
  if (errors.length > 0) {
    const message = errors
      .map((error) => `${error.configPath} -> "${error.referencedId}" (${error.message})`)
      .join('\n');
    throw new Error(`Invalid visual config references:\n${message}`);
  }

  const visualConfigProvider = new VisualConfigProvider(visualConfig);
  const boardZones = partitionZones(gameDef).board;
  const capabilities: MapEditorBootstrapCapabilities = {
    supportsMapEditor: resolveLayoutMode(gameDef, visualConfigProvider) === 'graph' && boardZones.length > 0,
  };

  return {
    descriptor,
    gameDef,
    visualConfig,
    visualConfigProvider,
    capabilities,
  };
}

function parseRequiredVisualConfig(descriptor: BootstrapDescriptor): VisualConfig {
  const parsed = parseVisualConfigStrict(descriptor.resolveVisualConfigYaml());
  if (parsed === null) {
    throw new Error(`Invalid visual config schema for bootstrap descriptor "${descriptor.id}"`);
  }
  return parsed;
}
