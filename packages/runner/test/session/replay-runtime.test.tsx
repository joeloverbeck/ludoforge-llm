// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { asActionId } from '@ludoforge/engine/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHumanSeatController } from '../../src/seat/seat-controller.js';
import type { SessionState } from '../../src/session/session-types.js';
import { useReplayRuntime } from '../../src/session/replay-runtime.js';

const testDoubles = vi.hoisted(() => ({
  createGameBridge: vi.fn(),
  resolveRuntimeBootstrap: vi.fn(),
  createGameStore: vi.fn(),
  createReplayController: vi.fn(),
  createReplayStore: vi.fn(),
  initGame: vi.fn(),
  hydrateFromReplayStep: vi.fn(),
  reportBootstrapFailure: vi.fn(),
  terminate: vi.fn(),
  detachFatalError: vi.fn(),
  syncFromController: vi.fn(),
  destroyReplayStore: vi.fn(),
  bridgeGetState: vi.fn(),
  bridgePublishMicroturn: vi.fn(),
  bridgeTerminalResult: vi.fn(),
  onReplayStateChange: null as (() => void) | null,
}));

vi.mock('../../src/bridge/game-bridge.js', () => ({
  createGameBridge: testDoubles.createGameBridge,
}));

vi.mock('../../src/bootstrap/runner-bootstrap.js', () => ({
  resolveRuntimeBootstrap: testDoubles.resolveRuntimeBootstrap,
}));

vi.mock('../../src/store/game-store.js', () => ({
  createGameStore: testDoubles.createGameStore,
}));

vi.mock('../../src/replay/replay-controller.js', () => ({
  createReplayController: testDoubles.createReplayController,
}));

vi.mock('../../src/replay/replay-store.js', () => ({
  createReplayStore: testDoubles.createReplayStore,
}));

function HookHarness({ sessionState }: { readonly sessionState: SessionState }) {
  const runtime = useReplayRuntime(sessionState);
  return createElement('div', {
    'data-testid': runtime === null ? 'replay-runtime-null' : 'replay-runtime-ready',
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useReplayRuntime', () => {
  beforeEach(() => {
    vi.resetModules();
    testDoubles.createGameBridge.mockReset();
    testDoubles.resolveRuntimeBootstrap.mockReset();
    testDoubles.createGameStore.mockReset();
    testDoubles.createReplayController.mockReset();
    testDoubles.createReplayStore.mockReset();
    testDoubles.initGame.mockReset();
    testDoubles.hydrateFromReplayStep.mockReset();
    testDoubles.reportBootstrapFailure.mockReset();
    testDoubles.terminate.mockReset();
    testDoubles.detachFatalError.mockReset();
    testDoubles.syncFromController.mockReset();
    testDoubles.destroyReplayStore.mockReset();
    testDoubles.bridgeGetState.mockReset();
    testDoubles.bridgePublishMicroturn.mockReset();
    testDoubles.bridgeTerminalResult.mockReset();
    testDoubles.onReplayStateChange = null;

    testDoubles.resolveRuntimeBootstrap.mockReturnValue({
      descriptor: { id: 'fitl' },
      seed: 17,
      playerId: 1,
      visualConfigProvider: {},
      resolveGameDef: async () => ({ metadata: { id: 'fitl' } }),
    });

    testDoubles.bridgeGetState.mockResolvedValue({ turn: 2 });
    testDoubles.bridgePublishMicroturn.mockResolvedValue(null);
    testDoubles.bridgeTerminalResult.mockResolvedValue(null);
    testDoubles.createGameBridge.mockReturnValue({
      bridge: {
        getState: testDoubles.bridgeGetState,
        publishMicroturn: testDoubles.bridgePublishMicroturn,
        terminalResult: testDoubles.bridgeTerminalResult,
      },
      onFatalError: vi.fn(() => testDoubles.detachFatalError),
      terminate: testDoubles.terminate,
    });

    testDoubles.initGame.mockResolvedValue(undefined);
    testDoubles.createGameStore.mockReturnValue({
      getState: () => ({
        initGame: testDoubles.initGame,
        hydrateFromReplayStep: testDoubles.hydrateFromReplayStep,
        reportBootstrapFailure: testDoubles.reportBootstrapFailure,
      }),
    });

    testDoubles.createReplayController.mockImplementation((
      _bridge: unknown,
      _gameDef: unknown,
      _seed: number,
      _moveHistory: readonly unknown[],
      onStateChange: () => void,
    ) => {
      testDoubles.onReplayStateChange = onStateChange;
      return {
        totalMoves: 4,
        currentMoveIndex: -1,
        isPlaying: false,
        playbackSpeed: 1,
        lastEffectTrace: [{ type: 'mutation' }],
        lastTriggerFirings: [{ id: 'trigger-1' }],
        stepForward: vi.fn(async () => undefined),
        stepBackward: vi.fn(async () => undefined),
        jumpToMove: vi.fn(async () => undefined),
        play: vi.fn(),
        pause: vi.fn(),
        setSpeed: vi.fn(),
        destroy: vi.fn(),
      };
    });

    testDoubles.createReplayStore.mockReturnValue({
      getState: () => ({
        currentMoveIndex: -1,
        totalMoves: 4,
        isPlaying: false,
        playbackSpeed: 1,
        stepForward: vi.fn(async () => undefined),
        stepBackward: vi.fn(async () => undefined),
        jumpToMove: vi.fn(async () => undefined),
        play: vi.fn(),
        pause: vi.fn(),
        setSpeed: vi.fn(),
        syncFromController: testDoubles.syncFromController,
        destroy: testDoubles.destroyReplayStore,
      }),
    });
  });

  it('returns null outside replay screen', () => {
    render(createElement(HookHarness, { sessionState: { screen: 'gameSelection' } }));

    expect(screen.getByTestId('replay-runtime-null')).toBeTruthy();
    expect(testDoubles.createGameBridge).not.toHaveBeenCalled();
  });

  it('creates runtime and initializes replay game state', async () => {
    render(createElement(HookHarness, {
      sessionState: {
        screen: 'replay',
        gameId: 'fitl',
        seed: 17,
        moveHistory: [],
        playerConfig: [{ playerId: 1, controller: createHumanSeatController() }],
      },
    }));

    await waitFor(() => {
      expect(screen.getByTestId('replay-runtime-ready')).toBeTruthy();
    });
    expect(testDoubles.createGameBridge).toHaveBeenCalledTimes(1);
    expect(testDoubles.createGameStore).toHaveBeenCalledTimes(1);
    expect(testDoubles.initGame).toHaveBeenCalledTimes(1);
    expect(testDoubles.resolveRuntimeBootstrap).toHaveBeenCalledWith(
      'fitl',
      17,
      [{ playerId: 1, controller: createHumanSeatController() }],
    );
  });

  it('hydrates game-store replay projection on replay controller state changes', async () => {
    render(createElement(HookHarness, {
      sessionState: {
        screen: 'replay',
        gameId: 'fitl',
        seed: 17,
        moveHistory: [{ actionId: asActionId('move:a'), params: {} }],
        playerConfig: [{ playerId: 1, controller: createHumanSeatController() }],
      },
    }));

    await waitFor(() => {
      expect(screen.getByTestId('replay-runtime-ready')).toBeTruthy();
    });

    testDoubles.onReplayStateChange?.();

    await waitFor(() => {
      expect(testDoubles.syncFromController).toHaveBeenCalledTimes(1);
      expect(testDoubles.hydrateFromReplayStep).toHaveBeenCalledTimes(1);
    });
  });

  it('reports bootstrap failure when bridge fatal error fires during replay', async () => {
    render(createElement(HookHarness, {
      sessionState: {
        screen: 'replay',
        gameId: 'fitl',
        seed: 17,
        moveHistory: [],
        playerConfig: [{ playerId: 1, controller: createHumanSeatController() }],
      },
    }));

    const bridgeHandle = testDoubles.createGameBridge.mock.results[0]?.value as {
      onFatalError: ReturnType<typeof vi.fn>;
    };
    const fatalErrorListener = bridgeHandle.onFatalError.mock.calls[0]?.[0] as ((error: unknown) => void) | undefined;
    expect(typeof fatalErrorListener).toBe('function');
    fatalErrorListener?.({ message: 'Worker startup failed.' });

    await waitFor(() => {
      expect(testDoubles.reportBootstrapFailure).toHaveBeenCalledWith({ message: 'Worker startup failed.' });
    });
  });

  it('detaches fatal error listener on replay teardown', async () => {
    const { rerender } = render(createElement(HookHarness, {
      sessionState: {
        screen: 'replay',
        gameId: 'fitl',
        seed: 17,
        moveHistory: [],
        playerConfig: [{ playerId: 1, controller: createHumanSeatController() }],
      },
    }));

    await waitFor(() => {
      expect(screen.getByTestId('replay-runtime-ready')).toBeTruthy();
    });

    rerender(createElement(HookHarness, { sessionState: { screen: 'gameSelection' } }));

    await waitFor(() => {
      expect(screen.getByTestId('replay-runtime-null')).toBeTruthy();
      expect(testDoubles.detachFatalError).toHaveBeenCalledTimes(1);
      expect(testDoubles.terminate).toHaveBeenCalledTimes(1);
    });
  });

  it('tears down replay store/controller and worker bridge on route exit', async () => {
    const { rerender } = render(createElement(HookHarness, {
      sessionState: {
        screen: 'replay',
        gameId: 'fitl',
        seed: 17,
        moveHistory: [],
        playerConfig: [{ playerId: 1, controller: createHumanSeatController() }],
      },
    }));

    await waitFor(() => {
      expect(screen.getByTestId('replay-runtime-ready')).toBeTruthy();
    });

    rerender(createElement(HookHarness, { sessionState: { screen: 'gameSelection' } }));

    await waitFor(() => {
      expect(screen.getByTestId('replay-runtime-null')).toBeTruthy();
      expect(testDoubles.destroyReplayStore).toHaveBeenCalledTimes(1);
      expect(testDoubles.terminate).toHaveBeenCalledTimes(1);
    });
  });

  it('throws for unknown replay descriptor ids through the typed bootstrap seam', () => {
    testDoubles.resolveRuntimeBootstrap.mockReturnValue(null);

    expect(() => render(createElement(HookHarness, {
      sessionState: {
        screen: 'replay',
        gameId: 'missing',
        seed: 17,
        moveHistory: [],
        playerConfig: [{ playerId: 1, controller: createHumanSeatController() }],
      },
    }))).toThrowError(/Unknown replay descriptor id: missing/u);
  });
});
