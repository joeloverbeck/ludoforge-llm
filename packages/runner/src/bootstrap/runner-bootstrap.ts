import { assertValidatedGameDefInput, asPlayerId, type GameDef, type PlayerId } from '@ludoforge/engine/runtime';

import {
  buildRefValidationContext,
  parseVisualConfigStrict,
  validateVisualConfigRefs,
  VisualConfigProvider,
  type VisualConfig,
} from '../config/index.js';
import { partitionZones, resolveLayoutMode } from '../layout/build-layout-graph.js';
import { isHumanSeatController, type PlayerSeatConfig } from '../seat/seat-controller.js';

import {
  findBootstrapDescriptorById,
  type BootstrapDescriptor,
} from './bootstrap-registry.js';

export interface RunnerBootstrapCapabilities {
  readonly supportsMapEditor: boolean;
}

export interface ResolvedRunnerBootstrap {
  readonly descriptor: BootstrapDescriptor;
  readonly gameDef: GameDef;
  readonly visualConfig: VisualConfig;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly capabilities: RunnerBootstrapCapabilities;
}

export interface RunnerBootstrapHandle {
  readonly descriptor: BootstrapDescriptor;
  readonly visualConfig: VisualConfig;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly resolveGameDef: () => Promise<GameDef>;
  readonly resolveCapabilities: () => Promise<RunnerBootstrapCapabilities>;
  readonly resolve: () => Promise<ResolvedRunnerBootstrap>;
}

export interface RuntimeBootstrapConfig {
  readonly descriptor: BootstrapDescriptor;
  readonly seed: number;
  readonly playerId: PlayerId;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly resolveGameDef: () => Promise<GameDef>;
}

const bootstrapHandleCache = new Map<string, RunnerBootstrapHandle>();

export function resolveRunnerBootstrapHandle(
  descriptor: BootstrapDescriptor,
): RunnerBootstrapHandle {
  const cached = bootstrapHandleCache.get(descriptor.id);
  if (cached !== undefined) {
    return cached;
  }

  const visualConfig = parseRequiredVisualConfig(descriptor);
  const visualConfigProvider = new VisualConfigProvider(visualConfig);
  let resolvedBootstrap: Promise<ResolvedRunnerBootstrap> | null = null;
  const resolve = (): Promise<ResolvedRunnerBootstrap> => {
    resolvedBootstrap ??= loadResolvedRunnerBootstrap(
      descriptor,
      visualConfig,
      visualConfigProvider,
    );
    return resolvedBootstrap;
  };

  const handle: RunnerBootstrapHandle = {
    descriptor,
    visualConfig,
    visualConfigProvider,
    resolveGameDef: async () => (await resolve()).gameDef,
    resolveCapabilities: async () => (await resolve()).capabilities,
    resolve,
  };
  bootstrapHandleCache.set(descriptor.id, handle);
  return handle;
}

export async function resolveRunnerBootstrapByGameId(
  gameId: string,
): Promise<ResolvedRunnerBootstrap | null> {
  const descriptor = findBootstrapDescriptorById(gameId);
  if (descriptor === null) {
    return null;
  }

  return resolveRunnerBootstrapHandle(descriptor).resolve();
}

export function resolveRuntimeBootstrap(
  gameId: string,
  seed: number,
  playerConfig: readonly PlayerSeatConfig[],
): RuntimeBootstrapConfig | null {
  const descriptor = findBootstrapDescriptorById(gameId);
  if (descriptor === null) {
    return null;
  }

  const humanSeat = playerConfig.find((seat) => isHumanSeatController(seat.controller));
  const handle = resolveRunnerBootstrapHandle(descriptor);

  return {
    descriptor,
    seed,
    playerId: asPlayerId(humanSeat?.playerId ?? descriptor.defaultPlayerId),
    visualConfigProvider: handle.visualConfigProvider,
    resolveGameDef: handle.resolveGameDef,
  };
}

async function loadResolvedRunnerBootstrap(
  descriptor: BootstrapDescriptor,
  visualConfig: VisualConfig,
  visualConfigProvider: VisualConfigProvider,
): Promise<ResolvedRunnerBootstrap> {
  const gameDefInput = await descriptor.resolveGameDefInput();
  const gameDef = assertValidatedGameDefInput(gameDefInput, descriptor.sourceLabel);
  const errors = validateVisualConfigRefs(visualConfig, buildRefValidationContext(gameDef));
  if (errors.length > 0) {
    const message = errors
      .map((error) => `${error.configPath} -> "${error.referencedId}" (${error.message})`)
      .join('\n');
    throw new Error(`Invalid visual config references:\n${message}`);
  }

  const boardZones = partitionZones(gameDef).board;
  const capabilities: RunnerBootstrapCapabilities = {
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
