import { describe, expect, it } from 'vitest';

import { VisualConfigSchema } from '../../src/config/visual-config-types';
import {
  assertBootstrapRegistry,
  assertBootstrapTargetDefinitions,
  type BootstrapGameMetadataSummary,
  listBootstrapDescriptors,
  resolveBootstrapDescriptor,
  type BootstrapDescriptor,
} from '../../src/bootstrap/bootstrap-registry';

describe('bootstrap-registry', () => {
  it('resolves texas descriptor as default when game query is omitted', () => {
    const descriptor = resolveBootstrapDescriptor(null);
    expect(descriptor.id).toBe('texas');
  });

  it('resolves known descriptor by query value', () => {
    const descriptor = resolveBootstrapDescriptor('fitl');
    expect(descriptor.id).toBe('fitl');
  });

  it('resolves texas descriptor by query value', () => {
    const descriptor = resolveBootstrapDescriptor('texas');
    expect(descriptor.id).toBe('texas');
  });

  it('falls back to texas descriptor for unknown query values', () => {
    const descriptor = resolveBootstrapDescriptor('unknown');
    expect(descriptor.id).toBe('texas');
  });

  it('exports descriptors with unique ids and query values', () => {
    const descriptors = listBootstrapDescriptors();
    const ids = new Set(descriptors.map((descriptor) => descriptor.id));
    const queryValues = new Set(descriptors.map((descriptor) => descriptor.queryValue));

    expect(ids.size).toBe(descriptors.length);
    expect(queryValues.size).toBe(descriptors.length);
  });

  it('exports expected descriptors from canonical bootstrap target manifest', () => {
    const descriptors = listBootstrapDescriptors();
    expect(descriptors.map((descriptor) => descriptor.id)).toEqual(['fitl', 'texas']);
    expect(descriptors.map((descriptor) => descriptor.queryValue)).toEqual(['fitl', 'texas']);
  });

  it('resolves visual config via generatedFromSpecPath mapping', () => {
    const descriptors = listBootstrapDescriptors();
    const fitl = descriptors.find((descriptor) => descriptor.id === 'fitl');
    const texas = descriptors.find((descriptor) => descriptor.id === 'texas');

    expect(fitl).toBeDefined();
    expect(texas).toBeDefined();
    expect(VisualConfigSchema.safeParse(fitl?.resolveVisualConfigYaml()).success).toBe(true);
    expect(VisualConfigSchema.safeParse(texas?.resolveVisualConfigYaml()).success).toBe(true);
  });

  it('exposes faction id summaries from fixture game defs', () => {
    const descriptors = listBootstrapDescriptors();
    const fitl = descriptors.find((descriptor) => descriptor.id === 'fitl');
    const texas = descriptors.find((descriptor) => descriptor.id === 'texas');

    expect(fitl?.gameMetadata.factionIds).toEqual(['us', 'arvn', 'nva', 'vc']);
    expect(texas?.gameMetadata.factionIds).toEqual(['neutral']);
  });

  it('throws when descriptor validation receives duplicate query values', () => {
    const descriptors: readonly BootstrapDescriptor[] = [
      descriptor('d0', 'dup'),
      descriptor('d1', 'dup'),
    ];

    expect(() => assertBootstrapRegistry(descriptors)).toThrow(/queryValue must be unique/u);
  });

  it('throws when descriptor validation receives invalid defaults', () => {
    const invalidSeedDescriptor = descriptor('d0', 'd0', { defaultSeed: -1 });
    const invalidPlayerDescriptor = descriptor('d1', 'd1', { defaultPlayerId: -1 });

    expect(() => assertBootstrapRegistry([invalidSeedDescriptor])).toThrow(/defaultSeed/u);
    expect(() => assertBootstrapRegistry([invalidPlayerDescriptor])).toThrow(/defaultPlayerId/u);
  });

  it('throws when target manifest validation receives duplicate fixture files', () => {
    const targets = [
      target('d0', 'd0', 'same.json'),
      target('d1', 'd1', 'same.json'),
    ];

    expect(() => assertBootstrapTargetDefinitions(targets)).toThrow(/fixtureFile must be unique/u);
  });

  it('throws when target manifest omits generatedFromSpecPath', () => {
    const targets = [
      {
        id: 'd0',
        queryValue: 'd0',
        defaultSeed: 42,
        defaultPlayerId: 0,
        sourceLabel: 'test fixture',
        fixtureFile: 'd0.json',
        specEntrypoint: 'data/games/d0.game-spec.md',
      },
    ];

    expect(() => assertBootstrapTargetDefinitions(targets)).toThrow(/generatedFromSpecPath/u);
  });

  it('throws when target manifest omits specEntrypoint', () => {
    const targets = [
      {
        id: 'd0',
        queryValue: 'd0',
        defaultSeed: 42,
        defaultPlayerId: 0,
        sourceLabel: 'test fixture',
        fixtureFile: 'd0.json',
        generatedFromSpecPath: 'data/games/d0',
      },
    ];

    expect(() => assertBootstrapTargetDefinitions(targets)).toThrow(/specEntrypoint/u);
  });
});

function descriptor(
  id: string,
  queryValue: string,
  overrides: Partial<BootstrapDescriptor> = {},
): BootstrapDescriptor {
  return {
    id,
    queryValue,
    defaultSeed: 42,
    defaultPlayerId: 0,
    sourceLabel: 'test fixture',
    gameMetadata: {
      name: id,
      description: '',
      playerMin: 1,
      playerMax: 4,
      factionIds: [],
    } satisfies BootstrapGameMetadataSummary,
    resolveGameDefInput: async () => ({}),
    resolveVisualConfigYaml: () => null,
    ...overrides,
  };
}

function target(
  id: string,
  queryValue: string,
  fixtureFile: string,
): {
  id: string;
  queryValue: string;
  defaultSeed: number;
  defaultPlayerId: number;
  sourceLabel: string;
  fixtureFile: string;
  generatedFromSpecPath: string;
  specEntrypoint: string;
} {
  return {
    id,
    queryValue,
    defaultSeed: 42,
    defaultPlayerId: 0,
    sourceLabel: 'test fixture',
    fixtureFile,
    generatedFromSpecPath: `data/games/${id}`,
    specEntrypoint: `data/games/${id}.game-spec.md`,
  };
}
