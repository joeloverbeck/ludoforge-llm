import defaultBootstrapGameDef from './default-game-def.json';

export interface BootstrapDescriptor {
  readonly id: string;
  readonly queryValue: string;
  readonly defaultSeed: number;
  readonly defaultPlayerId: number;
  readonly sourceLabel: string;
  readonly resolveGameDefInput: () => Promise<unknown>;
}

const DEFAULT_BOOTSTRAP_DESCRIPTOR: BootstrapDescriptor = {
  id: 'default',
  queryValue: 'default',
  defaultSeed: 42,
  defaultPlayerId: 0,
  sourceLabel: 'runner bootstrap fixture',
  resolveGameDefInput: async () => defaultBootstrapGameDef,
};

const FITL_BOOTSTRAP_DESCRIPTOR: BootstrapDescriptor = {
  id: 'fitl',
  queryValue: 'fitl',
  defaultSeed: 42,
  defaultPlayerId: 0,
  sourceLabel: 'FITL bootstrap fixture',
  resolveGameDefInput: async () => (await import('./fitl-game-def.json')).default,
};

const TEXAS_BOOTSTRAP_DESCRIPTOR: BootstrapDescriptor = {
  id: 'texas',
  queryValue: 'texas',
  defaultSeed: 42,
  defaultPlayerId: 0,
  sourceLabel: "Texas Hold'em bootstrap fixture",
  resolveGameDefInput: async () => (await import('./texas-game-def.json')).default,
};

const BOOTSTRAP_REGISTRY: readonly BootstrapDescriptor[] = [
  DEFAULT_BOOTSTRAP_DESCRIPTOR,
  FITL_BOOTSTRAP_DESCRIPTOR,
  TEXAS_BOOTSTRAP_DESCRIPTOR,
];

assertBootstrapRegistry(BOOTSTRAP_REGISTRY);

export function listBootstrapDescriptors(): readonly BootstrapDescriptor[] {
  return BOOTSTRAP_REGISTRY;
}

export function resolveBootstrapDescriptor(game: string | null): BootstrapDescriptor {
  if (game === null) {
    return DEFAULT_BOOTSTRAP_DESCRIPTOR;
  }

  return BOOTSTRAP_REGISTRY.find((descriptor) => descriptor.queryValue === game) ?? DEFAULT_BOOTSTRAP_DESCRIPTOR;
}

export function assertBootstrapRegistry(descriptors: readonly BootstrapDescriptor[]): void {
  if (descriptors.length === 0) {
    throw new Error('Bootstrap registry must define at least one descriptor');
  }

  const ids = new Set<string>();
  const queryValues = new Set<string>();
  for (const descriptor of descriptors) {
    if (descriptor.id.length === 0) {
      throw new Error('Bootstrap descriptor id must be non-empty');
    }
    if (descriptor.queryValue.length === 0) {
      throw new Error(`Bootstrap descriptor queryValue must be non-empty (id=${descriptor.id})`);
    }
    if (ids.has(descriptor.id)) {
      throw new Error(`Bootstrap descriptor id must be unique (id=${descriptor.id})`);
    }
    if (queryValues.has(descriptor.queryValue)) {
      throw new Error(`Bootstrap descriptor queryValue must be unique (queryValue=${descriptor.queryValue})`);
    }
    if (!Number.isSafeInteger(descriptor.defaultSeed) || descriptor.defaultSeed < 0) {
      throw new Error(`Bootstrap descriptor defaultSeed must be a non-negative safe integer (id=${descriptor.id})`);
    }
    if (!Number.isSafeInteger(descriptor.defaultPlayerId) || descriptor.defaultPlayerId < 0) {
      throw new Error(`Bootstrap descriptor defaultPlayerId must be a non-negative safe integer (id=${descriptor.id})`);
    }
    if (descriptor.sourceLabel.length === 0) {
      throw new Error(`Bootstrap descriptor sourceLabel must be non-empty (id=${descriptor.id})`);
    }

    ids.add(descriptor.id);
    queryValues.add(descriptor.queryValue);
  }
}
