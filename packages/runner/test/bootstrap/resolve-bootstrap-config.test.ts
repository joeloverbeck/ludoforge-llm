import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  resolveBootstrapDescriptorMock,
  resolveRunnerBootstrapHandleMock,
} = vi.hoisted(() => ({
  resolveBootstrapDescriptorMock: vi.fn(),
  resolveRunnerBootstrapHandleMock: vi.fn(),
}));

vi.mock('../../src/bootstrap/bootstrap-registry.js', () => ({
  resolveBootstrapDescriptor: resolveBootstrapDescriptorMock,
}));

vi.mock('../../src/bootstrap/runner-bootstrap.js', () => ({
  resolveRunnerBootstrapHandle: resolveRunnerBootstrapHandleMock,
}));

import { resolveBootstrapConfig } from '../../src/bootstrap/resolve-bootstrap-config.js';

describe('resolveBootstrapConfig contract', () => {
  const texasDescriptor = {
    id: 'texas',
    defaultSeed: 42,
    defaultPlayerId: 0,
  };
  const fitlDescriptor = {
    id: 'fitl',
    defaultSeed: 99,
    defaultPlayerId: 2,
  };
  const texasHandle = {
    visualConfigProvider: { id: 'texas-provider' },
    resolveGameDef: vi.fn(async () => ({ metadata: { id: 'texas-holdem-nlhe-tournament' } })),
  };
  const fitlHandle = {
    visualConfigProvider: { id: 'fitl-provider' },
    resolveGameDef: vi.fn(async () => ({ metadata: { id: 'fire-in-the-lake' } })),
  };

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();

    resolveBootstrapDescriptorMock.mockImplementation((game: string | null) => (
      game === 'fitl' ? fitlDescriptor : texasDescriptor
    ));
    resolveRunnerBootstrapHandleMock.mockImplementation((descriptor: { id: string }) => (
      descriptor.id === 'fitl' ? fitlHandle : texasHandle
    ));
  });

  it('uses the default descriptor and default numeric params when search is empty', () => {
    const resolved = resolveBootstrapConfig('');

    expect(resolveBootstrapDescriptorMock).toHaveBeenCalledWith(null);
    expect(resolveRunnerBootstrapHandleMock).toHaveBeenCalledWith(texasDescriptor);
    expect(resolved.seed).toBe(42);
    expect(resolved.playerId).toBe(0);
    expect(resolved.visualConfigProvider).toBe(texasHandle.visualConfigProvider);
    expect(resolved.resolveGameDef).toBe(texasHandle.resolveGameDef);
  });

  it('parses explicit game, seed, and player params and wires the resolved handle through unchanged', async () => {
    const resolved = resolveBootstrapConfig('?game=fitl&seed=77&player=3');
    const gameDef = await resolved.resolveGameDef();

    expect(resolveBootstrapDescriptorMock).toHaveBeenCalledWith('fitl');
    expect(resolveRunnerBootstrapHandleMock).toHaveBeenCalledWith(fitlDescriptor);
    expect(resolved.seed).toBe(77);
    expect(resolved.playerId).toBe(3);
    expect(resolved.visualConfigProvider).toBe(fitlHandle.visualConfigProvider);
    expect(gameDef).toEqual({ metadata: { id: 'fire-in-the-lake' } });
  });

  it('falls back to descriptor defaults for invalid numeric params', () => {
    const resolved = resolveBootstrapConfig('?game=fitl&seed=NaN&player=-4');

    expect(resolved.seed).toBe(99);
    expect(resolved.playerId).toBe(2);
  });

  it('ignores non-safe integers and negatives when parsing numeric params', () => {
    const resolved = resolveBootstrapConfig(
      `?game=fitl&seed=${String(Number.MAX_SAFE_INTEGER + 1)}&player=-1`,
    );

    expect(resolved.seed).toBe(99);
    expect(resolved.playerId).toBe(2);
  });

  it('reads window.location.search when no explicit search string is provided', () => {
    vi.stubGlobal('window', {
      location: {
        search: '?game=fitl&seed=15&player=4',
      },
    });

    const resolved = resolveBootstrapConfig();

    expect(resolveBootstrapDescriptorMock).toHaveBeenCalledWith('fitl');
    expect(resolved.seed).toBe(15);
    expect(resolved.playerId).toBe(4);
  });
});
