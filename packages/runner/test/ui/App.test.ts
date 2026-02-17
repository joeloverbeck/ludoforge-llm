import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testDoubles = vi.hoisted(() => ({
  initGame: vi.fn(),
  terminate: vi.fn(),
  createGameBridge: vi.fn(),
  createGameStore: vi.fn(),
  effectCleanups: [] as Array<() => void>,
  gameContainerStore: null as unknown,
  bridge: {} as unknown,
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

import { App } from '../../src/App.js';

function renderApp(): string {
  return renderToStaticMarkup(createElement(App));
}

describe('App', () => {
  beforeEach(() => {
    testDoubles.effectCleanups = [];
    testDoubles.gameContainerStore = null;
    testDoubles.initGame.mockReset();
    testDoubles.terminate.mockReset();
    testDoubles.createGameBridge.mockReset();
    testDoubles.createGameStore.mockReset();

    const store = {
      getState: () => ({
        initGame: testDoubles.initGame,
      }),
    };

    testDoubles.createGameBridge.mockReturnValue({
      bridge: testDoubles.bridge,
      terminate: testDoubles.terminate,
    });
    testDoubles.createGameStore.mockReturnValue(store);
  });

  it('renders with ErrorBoundary wrapping GameContainer', () => {
    const html = renderApp();

    expect(html).toContain('data-testid="error-boundary"');
    expect(html).toContain('data-testid="game-container"');
  });

  it('creates bridge and store once per mount', () => {
    renderApp();

    expect(testDoubles.createGameBridge).toHaveBeenCalledTimes(1);
    expect(testDoubles.createGameStore).toHaveBeenCalledTimes(1);
    expect(testDoubles.createGameStore).toHaveBeenCalledWith(testDoubles.bridge);
    expect(testDoubles.gameContainerStore).toBe(testDoubles.createGameStore.mock.results[0]?.value);
  });

  it('calls initGame on mount with deterministic seed and player', () => {
    renderApp();

    expect(testDoubles.initGame).toHaveBeenCalledTimes(1);
    const [gameDef, seed, playerID] = testDoubles.initGame.mock.calls[0]!;
    expect(seed).toBe(42);
    expect(playerID).toBe(0);
    expect((gameDef as { readonly metadata?: { readonly id?: string } }).metadata?.id).toBe('runner-bootstrap-default');
  });

  it('terminates worker on unmount cleanup', () => {
    renderApp();

    expect(testDoubles.effectCleanups).toHaveLength(1);
    testDoubles.effectCleanups[0]!();
    expect(testDoubles.terminate).toHaveBeenCalledTimes(1);
  });
});
