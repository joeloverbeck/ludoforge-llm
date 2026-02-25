// @vitest-environment jsdom

import { createStore, type StoreApi } from 'zustand';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asActionId, asPlayerId, type Move } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';
import type { SessionStore } from '../../src/session/session-store.js';

const testDoubles = vi.hoisted(() => ({
  saveGame: vi.fn(),
}));

vi.mock('../../src/persistence/save-manager.js', () => ({
  saveGame: testDoubles.saveGame,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createSessionStoreFixture(moveAccumulator: readonly Move[]): StoreApi<SessionStore> {
  return createStore<SessionStore>()(() => ({
    sessionState: {
      screen: 'activeGame',
      gameId: 'fitl',
      seed: 17,
      playerConfig: [{ playerId: 1, type: 'human' }],
      initialMoveHistory: [],
    },
    unsavedChanges: true,
    moveAccumulator,
    selectGame: vi.fn(),
    startGame: vi.fn(),
    resumeGame: vi.fn(),
    returnToMenu: vi.fn(),
    startReplay: vi.fn(),
    newGame: vi.fn(),
    recordMove: vi.fn(),
    markSaved: vi.fn(),
  }));
}

function createGameStoreFixture(playerId: number | null, lifecycle: GameStore['gameLifecycle']): StoreApi<GameStore> {
  return createStore<GameStore>()(() => ({
    gameDef: null,
    gameState: null,
    playerID: playerId === null ? null : asPlayerId(playerId),
    gameLifecycle: lifecycle,
    loading: false,
    error: null,
    orchestrationDiagnostic: null,
    orchestrationDiagnosticSequence: 0,
    legalMoveResult: null,
    choicePending: null,
    effectTrace: [],
    triggerFirings: [],
    terminal: null,
    selectedAction: null,
    partialMove: null,
    choiceStack: [],
    animationPlaying: false,
    animationPlaybackSpeed: '1x',
    animationPaused: false,
    animationSkipRequestToken: 0,
    aiPlaybackDetailLevel: 'standard',
    aiPlaybackSpeed: '1x',
    aiPlaybackAutoSkip: false,
    aiSkipRequestToken: 0,
    playerSeats: new Map(),
    appliedMoveEvent: null,
    appliedMoveSequence: 0,
    activePhaseBanner: null,
    renderModel: null,
    initGame: vi.fn(async () => {}),
    initGameFromHistory: vi.fn(async () => {}),
    hydrateFromReplayStep: vi.fn(),
    reportBootstrapFailure: vi.fn(),
    selectAction: vi.fn(async () => {}),
    chooseOne: vi.fn(async () => {}),
    chooseN: vi.fn(async () => {}),
    confirmMove: vi.fn(async () => {}),
    resolveAiStep: vi.fn(async () => 'no-op' as const),
    resolveAiTurn: vi.fn(async () => {}),
    setAiPlaybackDetailLevel: vi.fn(),
    setAiPlaybackSpeed: vi.fn(),
    setAiPlaybackAutoSkip: vi.fn(),
    requestAiTurnSkip: vi.fn(),
    cancelChoice: vi.fn(async () => {}),
    cancelMove: vi.fn(),
    undo: vi.fn(async () => {}),
    setAnimationPlaying: vi.fn(),
    setAnimationPlaybackSpeed: vi.fn(),
    setAnimationPaused: vi.fn(),
    requestAnimationSkipCurrent: vi.fn(),
    reportPlaybackDiagnostic: vi.fn(),
    clearOrchestrationDiagnostic: vi.fn(),
    setActivePhaseBanner: vi.fn(),
    clearError: vi.fn(),
  }));
}

describe('SaveGameDialog', () => {
  beforeEach(() => {
    vi.resetModules();
    testDoubles.saveGame.mockReset();
    testDoubles.saveGame.mockResolvedValue('save-1');
  });

  it('renders and validates required save name', async () => {
    const { SaveGameDialog } = await import('../../src/ui/SaveGameDialog.js');
    const sessionStore = createSessionStoreFixture([]);
    const gameStore = createGameStoreFixture(1, 'playing');

    render(createElement(SaveGameDialog, {
      isOpen: true,
      gameName: 'Fire in the Lake',
      sessionState: {
        screen: 'activeGame',
        gameId: 'fitl',
        seed: 17,
        playerConfig: [{ playerId: 1, type: 'human' }],
        initialMoveHistory: [],
      },
      sessionStore,
      gameStore,
      onSaved: vi.fn(),
      onClose: vi.fn(),
    }));

    expect(screen.getByTestId('save-game-name')).toBeTruthy();
    expect((screen.getByTestId('save-game-submit') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId('save-game-name'), { target: { value: ' Campaign Night ' } });

    expect((screen.getByTestId('save-game-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('persists save payload and calls onSaved', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const { SaveGameDialog } = await import('../../src/ui/SaveGameDialog.js');
    const sessionStore = createSessionStoreFixture([{ actionId: asActionId('tick'), params: {} }]);
    const gameStore = createGameStoreFixture(1, 'terminal');

    render(createElement(SaveGameDialog, {
      isOpen: true,
      gameName: 'Fire in the Lake',
      sessionState: {
        screen: 'activeGame',
        gameId: 'fitl',
        seed: 17,
        playerConfig: [{ playerId: 1, type: 'human' }],
        initialMoveHistory: [],
      },
      sessionStore,
      gameStore,
      onSaved,
      onClose,
    }));

    fireEvent.change(screen.getByTestId('save-game-name'), { target: { value: 'Campaign Night' } });
    fireEvent.click(screen.getByTestId('save-game-submit'));

    await waitFor(() => {
      expect(testDoubles.saveGame).toHaveBeenCalledTimes(1);
    });
    expect(testDoubles.saveGame.mock.calls[0]?.[0]).toMatchObject({
      gameId: 'fitl',
      gameName: 'Fire in the Lake',
      displayName: 'Campaign Night',
      seed: 17,
      playerConfig: [{ playerId: 1, type: 'human' }],
      playerId: 1,
      moveCount: 1,
      isTerminal: true,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
