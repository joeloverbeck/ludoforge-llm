// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { asActionId } from '@ludoforge/engine/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '../../src/session/session-types.js';
import { useReplayRuntime } from '../../src/session/replay-runtime.js';

const testDoubles = vi.hoisted(() => ({
  createGameBridge: vi.fn(),
  resolveBootstrapConfig: vi.fn(),
  findBootstrapDescriptorById: vi.fn(),
  createGameStore: vi.fn(),
  createReplayController: vi.fn(),
  createReplayStore: vi.fn(),
  initGame: vi.fn(),
  hydrateFromReplayStep: vi.fn(),
  reportBootstrapFailure: vi.fn(),
  terminate: vi.fn(),
  syncFromController: vi.fn(),
  destroyReplayStore: vi.fn(),
  bridgeGetState: vi.fn(),
  bridgeEnumerateLegalMoves: vi.fn(),
  bridgeTerminalResult: vi.fn(),
  onReplayStateChange: null as (() => void) | null,
}));

vi.mock('../../src/bridge/game-bridge.js', () => ({
  createGameBridge: testDoubles.createGameBridge,
}));

vi.mock('../../src/bootstrap/resolve-bootstrap-config.js', () => ({
  resolveBootstrapConfig: testDoubles.resolveBootstrapConfig,
}));

vi.mock('../../src/session/active-game-runtime.js', () => ({
  findBootstrapDescriptorById: testDoubles.findBootstrapDescriptorById,
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
    testDoubles.resolveBootstrapConfig.mockReset();
    testDoubles.findBootstrapDescriptorById.mockReset();
    testDoubles.createGameStore.mockReset();
    testDoubles.createReplayController.mockReset();
    testDoubles.createReplayStore.mockReset();
    testDoubles.initGame.mockReset();
    testDoubles.hydrateFromReplayStep.mockReset();
    testDoubles.reportBootstrapFailure.mockReset();
    testDoubles.terminate.mockReset();
    testDoubles.syncFromController.mockReset();
    testDoubles.destroyReplayStore.mockReset();
    testDoubles.bridgeGetState.mockReset();
    testDoubles.bridgeEnumerateLegalMoves.mockReset();
    testDoubles.bridgeTerminalResult.mockReset();
    testDoubles.onReplayStateChange = null;

    testDoubles.findBootstrapDescriptorById.mockImplementation((gameId: string) => {
      if (gameId !== 'fitl') {
        return null;
      }
      return {
        id: 'fitl',
        queryValue: 'fitl',
        defaultPlayerId: 1,
      };
    });

    testDoubles.resolveBootstrapConfig.mockReturnValue({
      visualConfigProvider: {},
      resolveGameDef: async () => ({ metadata: { id: 'fitl' } }),
    });

    testDoubles.bridgeGetState.mockResolvedValue({ turn: 2 });
    testDoubles.bridgeEnumerateLegalMoves.mockResolvedValue({ moves: [] });
    testDoubles.bridgeTerminalResult.mockResolvedValue(null);
    testDoubles.createGameBridge.mockReturnValue({
      bridge: {
        getState: testDoubles.bridgeGetState,
        enumerateLegalMoves: testDoubles.bridgeEnumerateLegalMoves,
        terminalResult: testDoubles.bridgeTerminalResult,
      },
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
      },
    }));

    await waitFor(() => {
      expect(screen.getByTestId('replay-runtime-ready')).toBeTruthy();
    });
    expect(testDoubles.createGameBridge).toHaveBeenCalledTimes(1);
    expect(testDoubles.createGameStore).toHaveBeenCalledTimes(1);
    expect(testDoubles.initGame).toHaveBeenCalledTimes(1);
  });

  it('hydrates game-store replay projection on replay controller state changes', async () => {
    render(createElement(HookHarness, {
      sessionState: {
        screen: 'replay',
        gameId: 'fitl',
        seed: 17,
        moveHistory: [{ actionId: asActionId('move:a'), params: {} }],
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

  it('tears down replay store/controller and worker bridge on route exit', async () => {
    const { rerender } = render(createElement(HookHarness, {
      sessionState: {
        screen: 'replay',
        gameId: 'fitl',
        seed: 17,
        moveHistory: [],
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
});
