import { afterEach, describe, expect, it, vi } from 'vitest';

async function importResolver() {
  return import('../../src/bootstrap/resolve-bootstrap-config.js');
}

describe('resolveBootstrapConfig', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../src/bootstrap/default-game-def.json');
    vi.doUnmock('../../src/bootstrap/fitl-game-def.json');
    vi.doUnmock('../../src/bootstrap/bootstrap-registry');
  });

  it('returns default bootstrap config when query is empty', async () => {
    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('');
    const gameDef = await resolved.resolveGameDef();

    expect(resolved.seed).toBe(42);
    expect(resolved.playerId).toBe(0);
    expect(gameDef.metadata.id).toBe('runner-bootstrap-default');
  });

  it('returns FITL bootstrap config when game=fitl and applies params', async () => {
    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('?game=fitl&seed=77&player=3');
    const gameDef = await resolved.resolveGameDef();

    expect(resolved.seed).toBe(77);
    expect(resolved.playerId).toBe(3);
    expect(gameDef.metadata.id).toBe('fire-in-the-lake');
  });

  it('returns FITL bootstrap zones with board-map category/shape invariants needed by generic rendering', async () => {
    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('?game=fitl');
    const gameDef = await resolved.resolveGameDef();
    const zones = gameDef.zones;

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

    for (const zone of cityZones) {
      expect(zone.visual?.shape).toBe('circle');
      expect(zone.visual?.color).toMatch(/^#[0-9a-f]{6}$/iu);
      expect((zone.adjacentTo ?? []).length).toBeGreaterThan(0);
    }

    for (const zone of provinceZones) {
      expect(zone.visual?.shape).toBe('rectangle');
      expect(zone.visual?.color).toMatch(/^#[0-9a-f]{6}$/iu);
      expect((zone.adjacentTo ?? []).length).toBeGreaterThan(0);
    }

    for (const zone of locZones) {
      expect(zone.visual?.shape).toBe('line');
      expect(zone.visual?.color).toMatch(/^#[0-9a-f]{6}$/iu);
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
});
