import { afterEach, describe, expect, it, vi } from 'vitest';

async function importResolver() {
  return import('../../src/bootstrap/resolve-bootstrap-config.js');
}

describe('resolveBootstrapConfig', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../src/bootstrap/default-game-def.json');
    vi.doUnmock('../../src/bootstrap/fitl-game-def.json');
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

  it('falls back to defaults for invalid seed/player query params', async () => {
    const { resolveBootstrapConfig } = await importResolver();
    const resolved = resolveBootstrapConfig('?game=fitl&seed=NaN&player=-4');
    const gameDef = await resolved.resolveGameDef();

    expect(resolved.seed).toBe(42);
    expect(resolved.playerId).toBe(0);
    expect(gameDef.metadata.id).toBe('fire-in-the-lake');
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
