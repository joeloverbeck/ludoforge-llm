import bootstrapTargets from './bootstrap-targets.json';
import {
  FITL_VISUAL_CONFIG_YAML,
  TEXAS_VISUAL_CONFIG_YAML,
} from '../config/index.js';

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
  readonly resolveGameDefInput: () => Promise<unknown>;
  readonly resolveVisualConfigYaml: () => unknown;
}

const BOOTSTRAP_TARGET_DEFINITIONS = assertBootstrapTargetDefinitions(bootstrapTargets as unknown);
const FIXTURE_LOADERS = import.meta.glob('./*-game-def.json', { import: 'default' }) as Record<string, () => Promise<unknown>>;

const BOOTSTRAP_REGISTRY: readonly BootstrapDescriptor[] = BOOTSTRAP_TARGET_DEFINITIONS.map((target) => {
  const fixturePath = `./${target.fixtureFile}`;
  const fixtureLoader = FIXTURE_LOADERS[fixturePath];
  if (fixtureLoader === undefined) {
    throw new Error(`Bootstrap target fixture file does not exist (id=${target.id}, fixtureFile=${target.fixtureFile})`);
  }

  return {
    id: target.id,
    queryValue: target.queryValue,
    defaultSeed: target.defaultSeed,
    defaultPlayerId: target.defaultPlayerId,
    sourceLabel: target.sourceLabel,
    resolveGameDefInput: fixtureLoader,
    resolveVisualConfigYaml: () => resolveVisualConfigYaml(target.id),
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

function resolveVisualConfigYaml(targetId: string): unknown {
  const visualConfigsByTargetId: Readonly<Record<string, unknown>> = {
    default: null,
    fitl: FITL_VISUAL_CONFIG_YAML,
    texas: TEXAS_VISUAL_CONFIG_YAML,
  };
  return visualConfigsByTargetId[targetId] ?? null;
}
