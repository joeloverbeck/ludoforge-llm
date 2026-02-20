// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '../../src/session/session-types.js';
import { useActiveGameRuntime } from '../../src/session/active-game-runtime.js';

const testDoubles = vi.hoisted(() => ({
  initGame: vi.fn(),
  reportBootstrapFailure: vi.fn(),
  terminate: vi.fn(),
  createGameBridge: vi.fn(),
  createGameStore: vi.fn(),
  listBootstrapDescriptors: vi.fn(),
  resolveBootstrapConfig: vi.fn(),
  bridge: {} as unknown,
  visualConfigProvider: {} as unknown,
}));

vi.mock('../../src/bridge/game-bridge.js', () => ({
  createGameBridge: testDoubles.createGameBridge,
}));

vi.mock('../../src/store/game-store.js', () => ({
  createGameStore: testDoubles.createGameStore,
}));

vi.mock('../../src/bootstrap/bootstrap-registry.js', () => ({
  listBootstrapDescriptors: testDoubles.listBootstrapDescriptors,
}));

vi.mock('../../src/bootstrap/resolve-bootstrap-config.js', () => ({
  resolveBootstrapConfig: testDoubles.resolveBootstrapConfig,
}));

function HookHarness({ sessionState }: { readonly sessionState: SessionState }) {
  const runtime = useActiveGameRuntime(sessionState);
  return createElement('div', { 'data-testid': runtime === null ? 'runtime-null' : 'runtime-ready' });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useActiveGameRuntime', () => {
  beforeEach(() => {
    vi.resetModules();
    testDoubles.initGame.mockReset();
    testDoubles.reportBootstrapFailure.mockReset();
    testDoubles.terminate.mockReset();
    testDoubles.createGameBridge.mockReset();
    testDoubles.createGameStore.mockReset();
    testDoubles.listBootstrapDescriptors.mockReset();
    testDoubles.resolveBootstrapConfig.mockReset();

    testDoubles.listBootstrapDescriptors.mockReturnValue([
      {
        id: 'default',
        queryValue: 'default',
        defaultSeed: 42,
        defaultPlayerId: 0,
      },
      {
        id: 'fitl',
        queryValue: 'fitl',
        defaultSeed: 17,
        defaultPlayerId: 1,
      },
    ]);

    testDoubles.createGameBridge.mockReturnValue({
      bridge: testDoubles.bridge,
      terminate: testDoubles.terminate,
    });

    const gameStore = {
      getState: () => ({
        initGame: testDoubles.initGame,
        reportBootstrapFailure: testDoubles.reportBootstrapFailure,
      }),
    };
    testDoubles.createGameStore.mockReturnValue(gameStore);

    testDoubles.resolveBootstrapConfig.mockReturnValue({
      visualConfigProvider: testDoubles.visualConfigProvider,
      resolveGameDef: async () => ({ metadata: { id: 'fitl' } }),
    });
  });

  it('stays null outside activeGame and does not create runtime', () => {
    render(createElement(HookHarness, { sessionState: { screen: 'gameSelection' } }));

    expect(screen.getByTestId('runtime-null')).toBeTruthy();
    expect(testDoubles.createGameBridge).not.toHaveBeenCalled();
  });

  it('creates runtime and initializes game during activeGame', async () => {
    render(createElement(HookHarness, {
      sessionState: {
        screen: 'activeGame',
        gameId: 'fitl',
        seed: 17,
        playerConfig: [{ playerId: 1, type: 'human' }],
      },
    }));

    expect(screen.getByTestId('runtime-ready')).toBeTruthy();
    expect(testDoubles.createGameBridge).toHaveBeenCalledTimes(1);
    expect(testDoubles.createGameStore).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(testDoubles.initGame).toHaveBeenCalledTimes(1);
    });
  });

  it('terminates runtime when leaving activeGame', async () => {
    const { rerender } = render(createElement(HookHarness, {
      sessionState: {
        screen: 'activeGame',
        gameId: 'fitl',
        seed: 17,
        playerConfig: [{ playerId: 1, type: 'human' }],
      },
    }));

    expect(screen.getByTestId('runtime-ready')).toBeTruthy();

    rerender(createElement(HookHarness, { sessionState: { screen: 'gameSelection' } }));

    await waitFor(() => {
      expect(screen.getByTestId('runtime-null')).toBeTruthy();
      expect(testDoubles.terminate).toHaveBeenCalledTimes(1);
    });
  });
});
