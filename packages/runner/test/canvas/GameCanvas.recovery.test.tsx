/* @vitest-environment jsdom */

import { createElement } from 'react';
import { cleanup, render, waitFor, act } from '@testing-library/react';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameCanvas } from '../../src/canvas/GameCanvas.js';
import type { GameStore } from '../../src/store/game-store.js';
import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';

interface MockRuntime {
  readonly destroy: ReturnType<typeof vi.fn>;
  readonly setInteractionHighlights: ReturnType<typeof vi.fn>;
}

interface RecoveryHarnessState {
  readonly gameLifecycle: GameStore['gameLifecycle'];
  readonly terminal: GameStore['terminal'];
  readonly gameDef: GameStore['gameDef'];
  readonly gameState: GameStore['gameState'];
  readonly renderModel: GameStore['renderModel'];
  reportCanvasCrash(): void;
  beginCanvasRecovery(): void;
  canvasRecovered(): void;
}

const runtimeModuleDoubles = vi.hoisted(() => ({
  createGameCanvasRuntime: vi.fn(),
}));

vi.mock('../../src/canvas/game-canvas-runtime.js', () => ({
  createGameCanvasRuntime: runtimeModuleDoubles.createGameCanvasRuntime,
  createScopedLifecycleCallback: <T,>(callback?: (value: T) => void) => {
    let active = true;

    return {
      invoke(value: T): void {
        if (!active || callback === undefined) {
          return;
        }
        callback(value);
      },
      deactivate(): void {
        active = false;
      },
    };
  },
}));

const TEST_VISUAL_CONFIG_PROVIDER = new VisualConfigProvider(null);

function createRuntime(): MockRuntime {
  return {
    destroy: vi.fn(),
    setInteractionHighlights: vi.fn(),
  };
}

function createRecoveryStore(
  terminal: GameStore['terminal'] = null,
): {
  store: StoreApi<RecoveryHarnessState>;
  sessionSnapshot: Pick<RecoveryHarnessState, 'gameDef' | 'gameState' | 'renderModel'>;
  lifecycleTransitions: GameStore['gameLifecycle'][];
  reportCanvasCrash: ReturnType<typeof vi.fn>;
  beginCanvasRecovery: ReturnType<typeof vi.fn>;
  canvasRecovered: ReturnType<typeof vi.fn>;
} {
  const sessionSnapshot = {
    gameDef: { id: 'def:fixture' } as unknown as GameStore['gameDef'],
    gameState: { id: 'state:fixture' } as unknown as GameStore['gameState'],
    renderModel: { id: 'render:fixture' } as unknown as GameStore['renderModel'],
  };
  const lifecycleTransitions: GameStore['gameLifecycle'][] = [terminal === null ? 'playing' : 'terminal'];
  const store = createStore<RecoveryHarnessState>()(() => ({
    gameLifecycle: terminal === null ? 'playing' : 'terminal',
    terminal,
    ...sessionSnapshot,
    reportCanvasCrash: () => {
      reportCanvasCrash();
    },
    beginCanvasRecovery: () => {
      beginCanvasRecovery();
    },
    canvasRecovered: () => {
      canvasRecovered();
    },
  }));
  const reportCanvasCrash = vi.fn(() => {
    store.setState({ gameLifecycle: 'canvasCrashed' });
    lifecycleTransitions.push('canvasCrashed');
  });
  const beginCanvasRecovery = vi.fn(() => {
    store.setState({ gameLifecycle: 'reinitializing' });
    lifecycleTransitions.push('reinitializing');
  });
  const canvasRecovered = vi.fn(() => {
    const lifecycle = terminal === null ? 'playing' : 'terminal';
    store.setState({ gameLifecycle: lifecycle });
    lifecycleTransitions.push(lifecycle);
  });

  return {
    store,
    sessionSnapshot,
    lifecycleTransitions,
    reportCanvasCrash,
    beginCanvasRecovery,
    canvasRecovered,
  };
}

describe('GameCanvas recovery', () => {
  beforeEach(() => {
    runtimeModuleDoubles.createGameCanvasRuntime.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('forwards fatal runtime errors into crash recovery', async () => {
    const firstRuntime = createRuntime();
    const secondRuntime = createRuntime();
    runtimeModuleDoubles.createGameCanvasRuntime
      .mockResolvedValueOnce(firstRuntime)
      .mockResolvedValueOnce(secondRuntime);
    const storeFixture = createRecoveryStore();
    const onError = vi.fn();

    render(createElement(GameCanvas, {
      store: storeFixture.store as unknown as StoreApi<GameStore>,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      onError,
    }));

    await waitFor(() => {
      expect(runtimeModuleDoubles.createGameCanvasRuntime).toHaveBeenCalledTimes(1);
    });

    const firstCall = runtimeModuleDoubles.createGameCanvasRuntime.mock.calls[0]![0] as {
      onError?: (error: unknown) => void;
    };
    const failure = new Error('ticker exploded');

    act(() => {
      firstCall.onError?.(failure);
    });

    await waitFor(() => {
      expect(storeFixture.reportCanvasCrash).toHaveBeenCalledTimes(1);
      expect(storeFixture.beginCanvasRecovery).toHaveBeenCalledTimes(1);
      expect(runtimeModuleDoubles.createGameCanvasRuntime).toHaveBeenCalledTimes(2);
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it('re-mounts the runtime after crash recovery and preserves store session state', async () => {
    const firstRuntime = createRuntime();
    const secondRuntime = createRuntime();
    runtimeModuleDoubles.createGameCanvasRuntime
      .mockResolvedValueOnce(firstRuntime)
      .mockResolvedValueOnce(secondRuntime);
    const storeFixture = createRecoveryStore();

    render(createElement(GameCanvas, {
      store: storeFixture.store as unknown as StoreApi<GameStore>,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
    }));

    await waitFor(() => {
      expect(runtimeModuleDoubles.createGameCanvasRuntime).toHaveBeenCalledTimes(1);
    });

    const firstCall = runtimeModuleDoubles.createGameCanvasRuntime.mock.calls[0]![0] as {
      onError?: (error: unknown) => void;
    };

    act(() => {
      firstCall.onError?.(new Error('boom'));
    });

    await waitFor(() => {
      expect(runtimeModuleDoubles.createGameCanvasRuntime).toHaveBeenCalledTimes(2);
      expect(firstRuntime.destroy).toHaveBeenCalledTimes(1);
      expect(storeFixture.store.getState().gameLifecycle).toBe('playing');
    });

    expect(storeFixture.lifecycleTransitions).toEqual([
      'playing',
      'canvasCrashed',
      'reinitializing',
      'playing',
    ]);
    expect(storeFixture.store.getState().gameDef).toBe(storeFixture.sessionSnapshot.gameDef);
    expect(storeFixture.store.getState().gameState).toBe(storeFixture.sessionSnapshot.gameState);
    expect(storeFixture.store.getState().renderModel).toBe(storeFixture.sessionSnapshot.renderModel);
  });

  it('calls canvasRecovered after successful recovery mount', async () => {
    const firstRuntime = createRuntime();
    const secondRuntime = createRuntime();
    runtimeModuleDoubles.createGameCanvasRuntime
      .mockResolvedValueOnce(firstRuntime)
      .mockResolvedValueOnce(secondRuntime);
    const terminal = { type: 'draw' } as const;
    const storeFixture = createRecoveryStore(terminal);

    render(createElement(GameCanvas, {
      store: storeFixture.store as unknown as StoreApi<GameStore>,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
    }));

    await waitFor(() => {
      expect(runtimeModuleDoubles.createGameCanvasRuntime).toHaveBeenCalledTimes(1);
    });

    const firstCall = runtimeModuleDoubles.createGameCanvasRuntime.mock.calls[0]![0] as {
      onError?: (error: unknown) => void;
    };

    act(() => {
      firstCall.onError?.(new Error('boom'));
    });

    await waitFor(() => {
      expect(storeFixture.canvasRecovered).toHaveBeenCalledTimes(1);
      expect(storeFixture.store.getState().gameLifecycle).toBe('terminal');
    });

    expect(storeFixture.lifecycleTransitions).toEqual([
      'terminal',
      'canvasCrashed',
      'reinitializing',
      'terminal',
    ]);
  });

  it('supports repeated crash recovery cycles without mutating preserved store session state', async () => {
    const firstRuntime = createRuntime();
    const secondRuntime = createRuntime();
    const thirdRuntime = createRuntime();
    runtimeModuleDoubles.createGameCanvasRuntime
      .mockResolvedValueOnce(firstRuntime)
      .mockResolvedValueOnce(secondRuntime)
      .mockResolvedValueOnce(thirdRuntime);
    const storeFixture = createRecoveryStore();

    render(createElement(GameCanvas, {
      store: storeFixture.store as unknown as StoreApi<GameStore>,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
    }));

    await waitFor(() => {
      expect(runtimeModuleDoubles.createGameCanvasRuntime).toHaveBeenCalledTimes(1);
    });

    const firstCall = runtimeModuleDoubles.createGameCanvasRuntime.mock.calls[0]![0] as {
      onError?: (error: unknown) => void;
    };

    act(() => {
      firstCall.onError?.(new Error('first crash'));
    });

    await waitFor(() => {
      expect(runtimeModuleDoubles.createGameCanvasRuntime).toHaveBeenCalledTimes(2);
      expect(firstRuntime.destroy).toHaveBeenCalledTimes(1);
    });

    const secondCall = runtimeModuleDoubles.createGameCanvasRuntime.mock.calls[1]![0] as {
      onError?: (error: unknown) => void;
    };

    act(() => {
      secondCall.onError?.(new Error('second crash'));
    });

    await waitFor(() => {
      expect(runtimeModuleDoubles.createGameCanvasRuntime).toHaveBeenCalledTimes(3);
      expect(secondRuntime.destroy).toHaveBeenCalledTimes(1);
      expect(storeFixture.canvasRecovered).toHaveBeenCalledTimes(2);
    });

    expect(thirdRuntime.destroy).not.toHaveBeenCalled();
    expect(storeFixture.reportCanvasCrash).toHaveBeenCalledTimes(2);
    expect(storeFixture.beginCanvasRecovery).toHaveBeenCalledTimes(2);
    expect(storeFixture.lifecycleTransitions).toEqual([
      'playing',
      'canvasCrashed',
      'reinitializing',
      'playing',
      'canvasCrashed',
      'reinitializing',
      'playing',
    ]);
    expect(storeFixture.store.getState().gameDef).toBe(storeFixture.sessionSnapshot.gameDef);
    expect(storeFixture.store.getState().gameState).toBe(storeFixture.sessionSnapshot.gameState);
    expect(storeFixture.store.getState().renderModel).toBe(storeFixture.sessionSnapshot.renderModel);
  });
});
