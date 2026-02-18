import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testDoubles = vi.hoisted(() => ({
  initGame: vi.fn(),
  reportBootstrapFailure: vi.fn(),
  terminate: vi.fn(),
  createGameBridge: vi.fn(),
  createGameStore: vi.fn(),
  effectCleanups: [] as Array<() => void>,
  gameContainerStore: null as unknown,
  bridge: {} as unknown,
  resolveBootstrapConfig: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (typeof cleanup === 'function') {
        testDoubles.effectCleanups.push(cleanup);
      }
    },
  };
});

vi.mock('../../src/bridge/game-bridge.js', () => ({
  createGameBridge: testDoubles.createGameBridge,
}));

vi.mock('../../src/store/game-store.js', () => ({
  createGameStore: testDoubles.createGameStore,
}));

vi.mock('../../src/ui/GameContainer.js', () => ({
  GameContainer: (props: { readonly store: unknown }) => {
    testDoubles.gameContainerStore = props.store;
    return createElement('div', { 'data-testid': 'game-container' });
  },
}));

vi.mock('../../src/ui/ErrorBoundary.js', () => ({
  ErrorBoundary: (props: { readonly children: ReactNode }) => {
    return createElement('section', { 'data-testid': 'error-boundary' }, props.children);
  },
}));

vi.mock('../../src/bootstrap/resolve-bootstrap-config.js', () => ({
  resolveBootstrapConfig: testDoubles.resolveBootstrapConfig,
}));

async function renderApp(): Promise<string> {
  const { App } = await import('../../src/App.js');
  return renderToStaticMarkup(createElement(App));
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
}

describe('App', () => {
  beforeEach(() => {
    vi.resetModules();
    testDoubles.effectCleanups = [];
    testDoubles.gameContainerStore = null;
    testDoubles.initGame.mockReset();
    testDoubles.reportBootstrapFailure.mockReset();
    testDoubles.terminate.mockReset();
    testDoubles.createGameBridge.mockReset();
    testDoubles.createGameStore.mockReset();
    testDoubles.resolveBootstrapConfig.mockReset();

    const store = {
      getState: () => ({
        initGame: testDoubles.initGame,
        reportBootstrapFailure: testDoubles.reportBootstrapFailure,
      }),
    };

    testDoubles.createGameBridge.mockReturnValue({
      bridge: testDoubles.bridge,
      terminate: testDoubles.terminate,
    });
    testDoubles.createGameStore.mockReturnValue(store);
    testDoubles.resolveBootstrapConfig.mockReturnValue({
      seed: 42,
      playerId: 0,
      resolveGameDef: async () => ({ metadata: { id: 'runner-bootstrap-default' } }),
    });
  });

  it('renders with ErrorBoundary wrapping GameContainer', async () => {
    const html = await renderApp();

    expect(html).toContain('data-testid="error-boundary"');
    expect(html).toContain('data-testid="game-container"');
  });

  it('creates bridge and store once per mount', async () => {
    await renderApp();
    await flushMicrotasks();

    expect(testDoubles.createGameBridge).toHaveBeenCalledTimes(1);
    expect(testDoubles.createGameStore).toHaveBeenCalledTimes(1);
    expect(testDoubles.createGameStore).toHaveBeenCalledWith(testDoubles.bridge);
    expect(testDoubles.gameContainerStore).toBe(testDoubles.createGameStore.mock.results[0]?.value);
  });

  it('calls initGame on mount with resolved bootstrap config', async () => {
    const resolvedGameDef = { metadata: { id: 'fire-in-the-lake' } };
    testDoubles.resolveBootstrapConfig.mockReturnValue({
      seed: 99,
      playerId: 2,
      resolveGameDef: async () => resolvedGameDef,
    });

    await renderApp();
    await flushMicrotasks();

    expect(testDoubles.initGame).toHaveBeenCalledTimes(1);
    const [gameDef, seed, playerID] = testDoubles.initGame.mock.calls[0]!;
    expect(gameDef).toBe(resolvedGameDef);
    expect(seed).toBe(99);
    expect(playerID).toBe(2);
  });

  it('terminates worker on unmount cleanup', async () => {
    await renderApp();
    await flushMicrotasks();

    expect(testDoubles.effectCleanups).toHaveLength(1);
    testDoubles.effectCleanups[0]!();
    await flushMicrotasks();
    expect(testDoubles.terminate).toHaveBeenCalledTimes(1);
  });

  it('routes bootstrap config resolution failure through bootstrap error path', async () => {
    testDoubles.resolveBootstrapConfig.mockReturnValue({
      seed: 42,
      playerId: 0,
      resolveGameDef: async () => {
        throw new Error('bootstrap config failed');
      },
    });

    await renderApp();
    await flushMicrotasks();

    expect(testDoubles.initGame).not.toHaveBeenCalled();
    expect(testDoubles.reportBootstrapFailure).toHaveBeenCalledTimes(1);
    expect(testDoubles.reportBootstrapFailure).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'bootstrap config failed' }),
    );
  });

  it('routes unexpected initGame rejection through bootstrap error path', async () => {
    testDoubles.initGame.mockRejectedValue(new Error('initGame exploded'));

    await renderApp();
    await flushMicrotasks();

    expect(testDoubles.initGame).toHaveBeenCalledTimes(1);
    expect(testDoubles.reportBootstrapFailure).toHaveBeenCalledTimes(1);
    expect(testDoubles.reportBootstrapFailure).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'initGame exploded' }),
    );
  });
});
