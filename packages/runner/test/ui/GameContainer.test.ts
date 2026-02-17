import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';

import type { GameStore } from '../../src/store/game-store.js';
import { GameContainer } from '../../src/ui/GameContainer.js';

interface CapturedErrorStateProps {
  readonly error: { readonly message: string };
  readonly onRetry: () => void;
}

const testDoubles = vi.hoisted(() => ({
  errorStateProps: null as CapturedErrorStateProps | null,
}));

vi.mock('../../src/canvas/GameCanvas.js', () => ({
  GameCanvas: () => createElement('div', { 'data-testid': 'game-canvas' }),
}));

vi.mock('../../src/ui/ErrorState.js', () => ({
  ErrorState: (props: CapturedErrorStateProps) => {
    testDoubles.errorStateProps = props;
    return createElement('div', { 'data-testid': 'error-state' }, props.error.message);
  },
}));

type GameLifecycle = GameStore['gameLifecycle'];
type WorkerError = Exclude<GameStore['error'], null>;

interface MinimalContainerState {
  readonly gameLifecycle: GameLifecycle;
  readonly error: WorkerError | null;
  clearError(): void;
}

function createContainerStore(state: {
  readonly gameLifecycle: GameLifecycle;
  readonly error: WorkerError | null;
  readonly clearError?: () => void;
}): StoreApi<GameStore> {
  const clearError = state.clearError ?? (() => {});
  return createStore<MinimalContainerState>(() => ({
    gameLifecycle: state.gameLifecycle,
    error: state.error,
    clearError,
  })) as unknown as StoreApi<GameStore>;
}

describe('GameContainer', () => {
  it('renders LoadingState when lifecycle is idle', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'idle',
          error: null,
        }),
      }),
    );

    expect(html).toContain('Loading game...');
    expect(html).not.toContain('data-testid="game-canvas"');
    expect(html).not.toContain('data-testid="ui-overlay"');
  });

  it('renders LoadingState when lifecycle is initializing', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'initializing',
          error: null,
        }),
      }),
    );

    expect(html).toContain('Loading game...');
    expect(html).not.toContain('data-testid="game-canvas"');
    expect(html).not.toContain('data-testid="ui-overlay"');
  });

  it('renders ErrorState when error is non-null', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: {
            code: 'INTERNAL_ERROR',
            message: 'init failed',
          },
        }),
      }),
    );

    expect(html).toContain('data-testid="error-state"');
    expect(html).toContain('init failed');
    expect(html).not.toContain('data-testid="game-canvas"');
    expect(html).not.toContain('data-testid="ui-overlay"');
  });

  it('renders GameCanvas and UIOverlay when lifecycle is playing', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
        }),
      }),
    );

    expect(html).toContain('data-testid="game-canvas"');
    expect(html).toContain('data-testid="ui-overlay"');
  });

  it('renders GameCanvas and UIOverlay when lifecycle is terminal', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'terminal',
          error: null,
        }),
      }),
    );

    expect(html).toContain('data-testid="game-canvas"');
    expect(html).toContain('data-testid="ui-overlay"');
  });

  it('ErrorState retry callback calls clearError on the store', () => {
    testDoubles.errorStateProps = null;
    const clearError = vi.fn();

    renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: {
            code: 'INTERNAL_ERROR',
            message: 'retry me',
          },
          clearError,
        }),
      }),
    );

    const capturedErrorStateProps = testDoubles.errorStateProps as CapturedErrorStateProps | null;
    expect(capturedErrorStateProps).not.toBeNull();
    if (capturedErrorStateProps === null) {
      throw new Error('Expected ErrorState props to be captured.');
    }

    capturedErrorStateProps.onRetry();
    expect(clearError).toHaveBeenCalledTimes(1);
  });
});
