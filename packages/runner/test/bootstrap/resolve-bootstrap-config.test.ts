import { afterEach, describe, expect, it, vi } from 'vitest';

async function importResolver() {
  return import('../../src/bootstrap/resolve-bootstrap-config.js');
}

describe('resolveBootstrapConfig', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../src/bootstrap/default-game-def.json');
    vi.doUnmock('../../src/bootstrap/fitl-game-def.json');
    vi.doUnmock('../../src/bootstrap/texas-game-def.json');
    vi.doUnmock('../../src/bootstrap/bootstrap-registry');
  });

  it('returns default bootstrap config when query is empty', async () => {
    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('');
    const gameDef = await resolved.resolveGameDef();

    expect(resolved.seed).toBe(42);
    expect(resolved.playerId).toBe(0);
    expect(resolved.visualConfigProvider.resolveZoneVisual('zone:any', null, null)).toEqual({
      shape: 'rectangle',
      width: 160,
      height: 100,
      color: null,
    });
    expect(gameDef.metadata.id).toBe('runner-bootstrap-default');
    expect(gameDef.metadata.name).toBe('Runner Bootstrap Default');
    expect(gameDef.metadata.description).toBe('Minimal game for development testing');
  });

  it('returns FITL bootstrap config when game=fitl and applies params', async () => {
    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('?game=fitl&seed=77&player=3');
    const gameDef = await resolved.resolveGameDef();

    expect(resolved.seed).toBe(77);
    expect(resolved.playerId).toBe(3);
    expect(gameDef.metadata.id).toBe('fire-in-the-lake');
    expect(gameDef.metadata.name).toBe('Fire in the Lake');
    expect(gameDef.metadata.description).toBe('A 4-faction COIN-series wargame set in the Vietnam War');
  });

  it('returns Texas bootstrap config when game=texas and applies params', async () => {
    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('?game=texas&seed=77&player=3');
    const gameDef = await resolved.resolveGameDef();

    expect(resolved.seed).toBe(77);
    expect(resolved.playerId).toBe(3);
    expect(gameDef.metadata.id).toBe('texas-holdem-nlhe-tournament');
    expect(gameDef.metadata.name).toBe("Texas Hold'em");
    expect(gameDef.metadata.description).toBe("No-limit Texas Hold'em poker tournament");
  });

  it('returns FITL bootstrap config with visual-provider category style invariants needed by generic rendering', async () => {
    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('?game=fitl');
    const gameDef = await resolved.resolveGameDef();
    const allZones = gameDef.zones;
    const internalZones = allZones.filter((zone) => zone.isInternal === true);
    const zones = allZones.filter((zone) => zone.isInternal !== true);

    expect(allZones).toHaveLength(63);
    expect(internalZones).toHaveLength(5);
    for (const zone of internalZones) {
      expect(zone.zoneKind).toBe('aux');
      expect(zone.category ?? 'none').toBe('none');
      expect((zone.adjacentTo ?? []).length).toBe(0);
    }

    expect(zones).toHaveLength(58);

    const byCategory = zones.reduce<Record<string, number>>((acc, zone) => {
      const category = zone.category ?? 'none';
      acc[category] = (acc[category] ?? 0) + 1;
      return acc;
    }, {});

    expect(byCategory).toMatchObject({
      city: 8,
      province: 22,
      loc: 17,
      none: 11,
    });

    const cityZones = zones.filter((zone) => zone.category === 'city');
    const provinceZones = zones.filter((zone) => zone.category === 'province');
    const locZones = zones.filter((zone) => zone.category === 'loc');

    const provider = resolved.visualConfigProvider;

    expect(provider.resolveZoneVisual('sample:city', 'city', {})).toMatchObject({ shape: 'circle' });
    expect(provider.resolveZoneVisual('sample:province', 'province', {})).toMatchObject({ shape: 'rectangle' });
    expect(provider.resolveZoneVisual('sample:loc', 'loc', {})).toMatchObject({ shape: 'line' });

    for (const zone of cityZones) {
      expect((zone.adjacentTo ?? []).length).toBeGreaterThan(0);
    }
    for (const zone of provinceZones) {
      expect((zone.adjacentTo ?? []).length).toBeGreaterThan(0);
    }
    for (const zone of locZones) {
      expect((zone.adjacentTo ?? []).length).toBeGreaterThan(0);
    }
  });

  it('falls back to defaults for invalid seed/player query params', async () => {
    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('?game=fitl&seed=NaN&player=-4');
    const gameDef = await resolved.resolveGameDef();

    expect(resolved.seed).toBe(42);
    expect(resolved.playerId).toBe(0);
    expect(gameDef.metadata.id).toBe('fire-in-the-lake');
  });

  it('falls back to default bootstrap descriptor for unknown game ids', async () => {
    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('?game=unknown-game-id');
    const gameDef = await resolved.resolveGameDef();

    expect(resolved.seed).toBe(42);
    expect(resolved.playerId).toBe(0);
    expect(gameDef.metadata.id).toBe('runner-bootstrap-default');
  });

  it('fails fast when default bootstrap fixture is invalid', async () => {
    vi.doMock('../../src/bootstrap/default-game-def.json', () => ({
      default: { invalid: true },
    }));

    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('');
    await expect(resolved.resolveGameDef()).rejects.toThrowError(
      /Invalid GameDef input from runner bootstrap fixture/u,
    );
  });

  it('fails fast when FITL bootstrap fixture is invalid', async () => {
    vi.doMock('../../src/bootstrap/fitl-game-def.json', () => ({
      default: { invalid: true },
    }));

    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('?game=fitl');
    await expect(resolved.resolveGameDef()).rejects.toThrowError(
      /Invalid GameDef input from FITL bootstrap fixture/u,
    );
  });

  it("fails fast when Texas Hold'em bootstrap fixture is invalid", async () => {
    vi.doMock('../../src/bootstrap/texas-game-def.json', () => ({
      default: { invalid: true },
    }));

    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('?game=texas');
    await expect(resolved.resolveGameDef()).rejects.toThrowError(
      /Invalid GameDef input from Texas Hold'em bootstrap fixture/u,
    );
  });

  it('fails fast when visual config contains invalid cross-reference ids', async () => {
    vi.doMock('../../src/bootstrap/bootstrap-registry', async () => {
      const defaultFixture = (await import('../../src/bootstrap/default-game-def.json')).default;
      return {
        resolveBootstrapDescriptor: () => ({
          id: 'default',
          queryValue: 'default',
          defaultSeed: 42,
          defaultPlayerId: 0,
          sourceLabel: 'runner bootstrap fixture',
          resolveGameDefInput: async () => defaultFixture,
          resolveVisualConfigYaml: () => ({
            version: 1,
            zones: {
              overrides: {
                'not-a-real-zone': { label: 'bad' },
              },
            },
          }),
        }),
      };
    });

    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('');
    await expect(resolved.resolveGameDef()).rejects.toThrowError(
      /Invalid visual config references/u,
    );
  });
});
