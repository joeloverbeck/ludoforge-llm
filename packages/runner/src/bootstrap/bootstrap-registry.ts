import bootstrapTargets from './bootstrap-targets.json';

export interface BootstrapTargetDefinition {
  readonly id: string;
  readonly queryValue: string;
  readonly defaultSeed: number;
  readonly defaultPlayerId: number;
  readonly sourceLabel: string;
  readonly fixtureFile: string;
  readonly generatedFromSpecPath: string;
}

export interface BootstrapDescriptor {
  readonly id: string;
  readonly queryValue: string;
  readonly defaultSeed: number;
  readonly defaultPlayerId: number;
  readonly sourceLabel: string;
  readonly gameMetadata: BootstrapGameMetadataSummary;
  readonly resolveGameDefInput: () => Promise<unknown>;
  readonly resolveVisualConfigYaml: () => unknown;
}

export interface BootstrapGameMetadataSummary {
  readonly name: string;
  readonly description: string;
  readonly playerMin: number;
  readonly playerMax: number;
  readonly factionIds: readonly string[];
}

const BOOTSTRAP_TARGET_DEFINITIONS = assertBootstrapTargetDefinitions(bootstrapTargets as unknown);
const FIXTURE_LOADERS = import.meta.glob('./*-game-def.json', { import: 'default' }) as Record<string, () => Promise<unknown>>;
const FIXTURE_METADATA = import.meta.glob('./*-game-def.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const VISUAL_CONFIGS = import.meta.glob('../../../../data/games/*/visual-config.yaml', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const BOOTSTRAP_REGISTRY: readonly BootstrapDescriptor[] = BOOTSTRAP_TARGET_DEFINITIONS.map((target) => {
  const fixturePath = `./${target.fixtureFile}`;
  const fixtureLoader = FIXTURE_LOADERS[fixturePath];
  if (fixtureLoader === undefined) {
    throw new Error(`Bootstrap target fixture file does not exist (id=${target.id}, fixtureFile=${target.fixtureFile})`);
  }
  const fixtureMetadata = FIXTURE_METADATA[fixturePath];
  if (fixtureMetadata === undefined) {
    throw new Error(`Bootstrap metadata fixture does not exist (id=${target.id}, fixtureFile=${target.fixtureFile})`);
  }

  return {
    id: target.id,
    queryValue: target.queryValue,
    defaultSeed: target.defaultSeed,
    defaultPlayerId: target.defaultPlayerId,
    sourceLabel: target.sourceLabel,
    gameMetadata: resolveGameMetadataSummary(target.id, fixtureMetadata),
    resolveGameDefInput: fixtureLoader,
    resolveVisualConfigYaml: () => resolveVisualConfigYaml(target.generatedFromSpecPath),
  } satisfies BootstrapDescriptor;
});

assertBootstrapRegistry(BOOTSTRAP_REGISTRY);

const DEFAULT_BOOTSTRAP_DESCRIPTOR = resolveDefaultBootstrapDescriptor(BOOTSTRAP_REGISTRY);

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

export function assertBootstrapTargetDefinitions(targetsInput: unknown): readonly BootstrapTargetDefinition[] {
  if (!Array.isArray(targetsInput) || targetsInput.length === 0) {
    throw new Error('Bootstrap targets manifest must be a non-empty array');
  }

  const ids = new Set<string>();
  const queryValues = new Set<string>();
  const fixtureFiles = new Set<string>();

  const targets = targetsInput.map((target, index) => {
    if (target === null || typeof target !== 'object') {
      throw new Error(`Bootstrap target at index ${index} must be an object`);
    }

    const candidate = target as Record<string, unknown>;
    const id = requireNonEmptyString(candidate.id, `Bootstrap target id (index=${index})`);
    const queryValue = requireNonEmptyString(candidate.queryValue, `Bootstrap target queryValue (id=${id})`);
    const sourceLabel = requireNonEmptyString(candidate.sourceLabel, `Bootstrap target sourceLabel (id=${id})`);
    const fixtureFile = requireNonEmptyString(candidate.fixtureFile, `Bootstrap target fixtureFile (id=${id})`);

    if (!Number.isSafeInteger(candidate.defaultSeed) || (candidate.defaultSeed as number) < 0) {
      throw new Error(`Bootstrap target defaultSeed must be a non-negative safe integer (id=${id})`);
    }
    if (!Number.isSafeInteger(candidate.defaultPlayerId) || (candidate.defaultPlayerId as number) < 0) {
      throw new Error(`Bootstrap target defaultPlayerId must be a non-negative safe integer (id=${id})`);
    }

    const generatedFromSpecPath = requireNonEmptyString(
      candidate.generatedFromSpecPath,
      `Bootstrap target generatedFromSpecPath (id=${id})`,
    );

    if (ids.has(id)) {
      throw new Error(`Bootstrap target id must be unique (id=${id})`);
    }
    if (queryValues.has(queryValue)) {
      throw new Error(`Bootstrap target queryValue must be unique (queryValue=${queryValue})`);
    }
    if (fixtureFiles.has(fixtureFile)) {
      throw new Error(`Bootstrap target fixtureFile must be unique (fixtureFile=${fixtureFile})`);
    }

    ids.add(id);
    queryValues.add(queryValue);
    fixtureFiles.add(fixtureFile);

    return {
      id,
      queryValue,
      defaultSeed: candidate.defaultSeed as number,
      defaultPlayerId: candidate.defaultPlayerId as number,
      sourceLabel,
      fixtureFile,
      generatedFromSpecPath,
    } satisfies BootstrapTargetDefinition;
  });

  return targets;
}

function resolveDefaultBootstrapDescriptor(
  descriptors: readonly BootstrapDescriptor[],
): BootstrapDescriptor {
  const descriptor = descriptors.find((entry) => entry.id === 'default');
  if (descriptor === undefined) {
    throw new Error('Bootstrap registry must define a default descriptor (id=default)');
  }
  return descriptor;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function resolveVisualConfigYaml(generatedFromSpecPath: string): unknown {
  const suffix = `/${generatedFromSpecPath}/visual-config.yaml`;
  const matches = Object.entries(VISUAL_CONFIGS)
    .filter(([path]) => path.endsWith(suffix))
    .map(([, config]) => config);

  if (matches.length > 1) {
    throw new Error(`Multiple visual config matches for generatedFromSpecPath=${generatedFromSpecPath}`);
  }

  return matches[0] ?? null;
}

function resolveGameMetadataSummary(targetId: string, fixtureInput: unknown): BootstrapGameMetadataSummary {
  const fallbackSummary: BootstrapGameMetadataSummary = {
    name: targetId,
    description: '',
    playerMin: 0,
    playerMax: 0,
    factionIds: [],
  };
  const fixture = asRecord(fixtureInput);
  if (fixture === null) {
    return fallbackSummary;
  }
  const metadata = asRecord(fixture.metadata);
  if (metadata === null) {
    return fallbackSummary;
  }
  const players = asRecord(metadata.players);
  if (players === null) {
    return fallbackSummary;
  }
  const playerMin = asNonNegativeSafeInteger(players.min);
  const playerMax = asNonNegativeSafeInteger(players.max);
  if (playerMin === null || playerMax === null || playerMin > playerMax) {
    return fallbackSummary;
  }
  const name = readOptionalString(metadata.name);
  const description = readOptionalString(metadata.description);
  const factionIds = readFactionIds(fixture.seats);

  return {
    name: name ?? targetId,
    description: description ?? '',
    playerMin,
    playerMax,
    factionIds,
  } satisfies BootstrapGameMetadataSummary;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonNegativeSafeInteger(value: unknown): number | null {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return null;
  }
  return value as number;
}

function readOptionalString(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  return typeof value === 'string' ? value : null;
}

function readFactionIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => readOptionalString(entry.id))
    .filter((entry): entry is string => entry !== null && entry.length > 0);
}
