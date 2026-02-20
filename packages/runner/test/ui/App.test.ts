// @vitest-environment jsdom

import { createElement } from 'react';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface SessionStoreState {
  readonly sessionState:
    | { readonly screen: 'gameSelection' }
    | { readonly screen: 'preGameConfig'; readonly gameId: string }
    | {
      readonly screen: 'activeGame';
      readonly gameId: string;
      readonly seed: number;
      readonly playerConfig: ReadonlyArray<{ readonly playerId: number; readonly type: 'human' | 'ai-random' | 'ai-greedy' }>;
      readonly initialMoveHistory: readonly unknown[];
    }
    | { readonly screen: 'replay'; readonly gameId: string; readonly seed: number; readonly moveHistory: readonly unknown[] };
  readonly unsavedChanges: boolean;
  readonly moveAccumulator: readonly unknown[];
  selectGame(gameId: string): void;
  startGame(seed: number, playerConfig: ReadonlyArray<{ readonly playerId: number; readonly type: 'human' | 'ai-random' | 'ai-greedy' }>): void;
  resumeGame(gameId: string, seed: number, playerConfig: ReadonlyArray<{ readonly playerId: number; readonly type: 'human' | 'ai-random' | 'ai-greedy' }>, moveHistory: readonly unknown[]): void;
  returnToMenu(): void;
  startReplay(gameId: string, seed: number, moveHistory: readonly unknown[]): void;
  newGame(): void;
  recordMove(move: unknown): void;
  markSaved(): void;
}

interface SessionStoreApi {
  getState(): SessionStoreState;
  setState(partial: Partial<SessionStoreState>): void;
  subscribe(listener: () => void): () => void;
}

const testDoubles = vi.hoisted(() => ({
  findBootstrapDescriptorById: vi.fn(),
  useActiveGameRuntime: vi.fn(),
  useReplayRuntime: vi.fn(),
  createSessionStore: vi.fn(),
  loadGame: vi.fn(),
  deleteSavedGame: vi.fn(),
  runtimeStore: {
    getState: vi.fn(() => ({
      initGame: vi.fn(),
      reportBootstrapFailure: vi.fn(),
    })),
  },
  visualConfigProvider: {},
  sessionStore: null as SessionStoreApi | null,
}));

function createMockSessionStore(initialState?: Partial<Pick<SessionStoreState, 'sessionState' | 'unsavedChanges' | 'moveAccumulator'>>): SessionStoreApi {
  const listeners = new Set<() => void>();

  const store: SessionStoreApi = {
    getState: () => state,
    setState: (partial) => {
      state = { ...state, ...partial };
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  let state: SessionStoreState = {
    sessionState: { screen: 'gameSelection' },
    unsavedChanges: false,
    moveAccumulator: [],
    selectGame(gameId) {
      store.setState({ sessionState: { screen: 'preGameConfig', gameId } });
    },
    startGame(seed, playerConfig) {
      const current = store.getState().sessionState;
      if (current.screen !== 'preGameConfig') {
        throw new Error('Invalid session transition for startGame');
      }
      store.setState({
        sessionState: {
          screen: 'activeGame',
          gameId: current.gameId,
          seed,
          playerConfig,
          initialMoveHistory: [],
        },
        unsavedChanges: false,
        moveAccumulator: [],
      });
    },
    resumeGame(gameId, seed, playerConfig, moveHistory) {
      store.setState({
        sessionState: {
          screen: 'activeGame',
          gameId,
          seed,
          playerConfig,
          initialMoveHistory: moveHistory,
        },
        unsavedChanges: false,
        moveAccumulator: moveHistory,
      });
    },
    returnToMenu() {
      store.setState({
        sessionState: { screen: 'gameSelection' },
        unsavedChanges: false,
        moveAccumulator: [],
      });
    },
    startReplay(gameId, seed, moveHistory) {
      store.setState({
        sessionState: {
          screen: 'replay',
          gameId,
          seed,
          moveHistory,
        },
      });
    },
    newGame() {
      const current = store.getState().sessionState;
      if (current.screen !== 'activeGame') {
        throw new Error('Invalid session transition for newGame');
      }
      store.setState({
        sessionState: {
          screen: 'preGameConfig',
          gameId: current.gameId,
        },
      });
    },
    recordMove(move) {
      const currentMoves = store.getState().moveAccumulator;
      store.setState({
        moveAccumulator: [...currentMoves, move],
        unsavedChanges: true,
      });
    },
    markSaved() {
      store.setState({ unsavedChanges: false });
    },
    ...initialState,
  };

  return store;
}

vi.mock('../../src/session/active-game-runtime.js', () => ({
  findBootstrapDescriptorById: testDoubles.findBootstrapDescriptorById,
  useActiveGameRuntime: testDoubles.useActiveGameRuntime,
}));

vi.mock('../../src/session/replay-runtime.js', () => ({
  useReplayRuntime: testDoubles.useReplayRuntime,
}));

vi.mock('../../src/session/session-store.js', () => ({
  createSessionStore: testDoubles.createSessionStore,
}));

vi.mock('../../src/persistence/save-manager.js', () => ({
  loadGame: testDoubles.loadGame,
  deleteSavedGame: testDoubles.deleteSavedGame,
}));

vi.mock('../../src/ui/GameContainer.js', () => ({
  GameContainer: (props: {
    readonly onReturnToMenu?: () => void;
    readonly onQuit?: () => void;
    readonly onNewGame?: () => void;
    readonly onSave?: () => void;
    readonly onLoad?: () => void;
  }) => (
    createElement('div', { 'data-testid': 'game-container' },
      createElement('button', {
        type: 'button',
        'data-testid': 'game-container-return-menu',
        onClick: props.onReturnToMenu,
      }, 'return'),
      createElement('button', {
        type: 'button',
        'data-testid': 'game-container-quit',
        onClick: props.onQuit,
      }, 'quit'),
      createElement('button', {
        type: 'button',
        'data-testid': 'game-container-new-game',
        onClick: props.onNewGame,
      }, 'new'),
      createElement('button', {
        type: 'button',
        'data-testid': 'game-container-save',
        onClick: props.onSave,
      }, 'save'),
      createElement('button', {
        type: 'button',
        'data-testid': 'game-container-load',
        onClick: props.onLoad,
      }, 'load'),
    )
  ),
}));

vi.mock('../../src/ui/ErrorBoundary.js', () => ({
  ErrorBoundary: (props: { readonly children: ReactNode }) => createElement('section', { 'data-testid': 'error-boundary' }, props.children),
}));

vi.mock('../../src/ui/ReplayScreen.js', () => ({
  ReplayScreen: (props: { readonly onBackToMenu: () => void }) => (
    createElement('main', { 'data-testid': 'replay-screen' },
      createElement('button', {
        type: 'button',
        'data-testid': 'replay-back-to-menu',
        onClick: props.onBackToMenu,
      }, 'back'),
    )
  ),
}));

vi.mock('../../src/ui/GameSelectionScreen.js', () => ({
  GameSelectionScreen: (props: {
    readonly onSelectGame: (gameId: string) => void;
    readonly onResumeSavedGame?: (saveId: string) => void;
    readonly onReplaySavedGame?: (saveId: string) => void;
    readonly onDeleteSavedGame?: (saveId: string) => void;
  }) => (
    createElement('main', { 'data-testid': 'game-selection-screen' },
      createElement('button', {
        type: 'button',
        'data-testid': 'select-game-fitl',
        onClick: () => {
          props.onSelectGame('fitl');
        },
      }, 'select-fitl'),
      createElement('button', {
        type: 'button',
        'data-testid': 'resume-saved',
        onClick: () => props.onResumeSavedGame?.('save-1'),
      }, 'resume'),
      createElement('button', {
        type: 'button',
        'data-testid': 'replay-saved',
        onClick: () => props.onReplaySavedGame?.('save-1'),
      }, 'replay'),
      createElement('button', {
        type: 'button',
        'data-testid': 'delete-saved',
        onClick: () => props.onDeleteSavedGame?.('save-1'),
      }, 'delete'),
    )
  ),
}));

vi.mock('../../src/ui/SaveGameDialog.js', () => ({
  SaveGameDialog: (props: { readonly isOpen: boolean; readonly onClose: () => void; readonly onSaved: () => void }) => (
    props.isOpen
      ? createElement('div', { 'data-testid': 'save-game-dialog' },
        createElement('button', {
          type: 'button',
          'data-testid': 'save-game-dialog-confirm',
          onClick: props.onSaved,
        }, 'confirm-save'),
        createElement('button', {
          type: 'button',
          'data-testid': 'save-game-dialog-close',
          onClick: props.onClose,
        }, 'close-save'),
      )
      : null
  ),
}));

vi.mock('../../src/ui/LoadGameDialog.js', () => ({
  LoadGameDialog: (props: {
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly onResume: (record: {
      gameId: string;
      seed: number;
      moveHistory: readonly unknown[];
      playerConfig: ReadonlyArray<{ readonly playerId: number; readonly type: 'human' | 'ai-random' | 'ai-greedy' }>;
      isTerminal: boolean;
    }) => void;
    readonly onReplay: (record: { gameId: string; seed: number; moveHistory: readonly unknown[] }) => void;
  }) => (
    props.isOpen
      ? createElement('div', { 'data-testid': 'load-game-dialog' },
        createElement('button', {
          type: 'button',
          'data-testid': 'load-game-dialog-resume',
          onClick: () => props.onResume({
            gameId: 'fitl',
            seed: 17,
            moveHistory: [{ actionId: 'tick', params: {} }],
            playerConfig: [{ playerId: 1, type: 'human' }],
            isTerminal: false,
          }),
        }, 'resume-loaded'),
        createElement('button', {
          type: 'button',
          'data-testid': 'load-game-dialog-replay',
          onClick: () => props.onReplay({
            gameId: 'fitl',
            seed: 17,
            moveHistory: [{ actionId: 'tick', params: {} }],
          }),
        }, 'replay-loaded'),
        createElement('button', {
          type: 'button',
          'data-testid': 'load-game-dialog-close',
          onClick: props.onClose,
        }, 'close-load'),
      )
      : null
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App', () => {
  beforeEach(() => {
    vi.resetModules();
    testDoubles.findBootstrapDescriptorById.mockReset();
    testDoubles.useActiveGameRuntime.mockReset();
    testDoubles.useReplayRuntime.mockReset();
    testDoubles.createSessionStore.mockReset();
    testDoubles.loadGame.mockReset();
    testDoubles.deleteSavedGame.mockReset();

    testDoubles.findBootstrapDescriptorById.mockImplementation((gameId: string) => {
      if (gameId !== 'fitl') {
        return null;
      }
      return {
        id: 'fitl',
        queryValue: 'fitl',
        defaultSeed: 17,
        defaultPlayerId: 1,
        sourceLabel: 'FITL fixture',
        gameMetadata: {
          name: 'Fire in the Lake',
          description: 'test',
          playerMin: 2,
          playerMax: 4,
          factionIds: ['us', 'arvn', 'nva', 'vc'],
        },
        resolveGameDefInput: async () => ({}),
        resolveVisualConfigYaml: () => ({
          version: 1,
          factions: {
            us: { displayName: 'US' },
            arvn: { displayName: 'ARVN' },
          },
        }),
      };
    });

    testDoubles.useActiveGameRuntime.mockImplementation((sessionState: SessionStoreState['sessionState']) => {
      if (sessionState.screen !== 'activeGame') {
        return null;
      }
      return {
        store: testDoubles.runtimeStore,
        visualConfigProvider: testDoubles.visualConfigProvider,
      };
    });

    testDoubles.useReplayRuntime.mockImplementation((sessionState: SessionStoreState['sessionState']) => {
      if (sessionState.screen !== 'replay') {
        return null;
      }
      return {
        store: testDoubles.runtimeStore,
        replayStore: {
          getState: () => ({
            currentMoveIndex: -1,
            totalMoves: 1,
            isPlaying: false,
            playbackSpeed: 1,
            stepForward: vi.fn(async () => undefined),
            stepBackward: vi.fn(async () => undefined),
            jumpToMove: vi.fn(async () => undefined),
            play: vi.fn(),
            pause: vi.fn(),
            setSpeed: vi.fn(),
            syncFromController: vi.fn(),
            destroy: vi.fn(),
          }),
        },
        visualConfigProvider: testDoubles.visualConfigProvider,
      };
    });

    testDoubles.sessionStore = createMockSessionStore();
    testDoubles.createSessionStore.mockImplementation(() => testDoubles.sessionStore);
    testDoubles.loadGame.mockResolvedValue({
      gameId: 'fitl',
      seed: 17,
      moveHistory: [{ actionId: 'tick', params: {} }],
      playerConfig: [{ playerId: 1, type: 'human' }],
      isTerminal: false,
    });
    testDoubles.deleteSavedGame.mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
  });

  it('renders game selection screen by default', async () => {
    const { App } = await import('../../src/App.js');

    render(createElement(App));

    expect(screen.getByTestId('error-boundary')).toBeTruthy();
    expect(screen.getByTestId('game-selection-screen')).toBeTruthy();
    expect(screen.getByTestId('select-game-fitl')).toBeTruthy();
  });

  it('routes to active game on start', async () => {
    const { App } = await import('../../src/App.js');

    render(createElement(App));

    fireEvent.click(screen.getByTestId('select-game-fitl'));
    fireEvent.click(screen.getByTestId('pre-game-start'));

    await waitFor(() => {
      expect(screen.getByTestId('game-container')).toBeTruthy();
    });
    expect(testDoubles.useActiveGameRuntime).toHaveBeenCalled();
  });

  it('returns to menu when active game emits return action', async () => {
    const { App } = await import('../../src/App.js');

    render(createElement(App));
    fireEvent.click(screen.getByTestId('select-game-fitl'));
    fireEvent.click(screen.getByTestId('pre-game-start'));

    fireEvent.click(screen.getByTestId('game-container-return-menu'));

    await waitFor(() => {
      expect(screen.getByTestId('game-selection-screen')).toBeTruthy();
    });
  });

  it('shows unsaved-changes dialog on quit when unsavedChanges is true', async () => {
    testDoubles.sessionStore = createMockSessionStore({
      sessionState: {
        screen: 'activeGame',
        gameId: 'fitl',
        seed: 17,
        playerConfig: [{ playerId: 1, type: 'human' }],
        initialMoveHistory: [],
      },
      unsavedChanges: true,
    });
    testDoubles.createSessionStore.mockImplementation(() => testDoubles.sessionStore);

    const { App } = await import('../../src/App.js');

    render(createElement(App));
    fireEvent.click(screen.getByTestId('game-container-quit'));

    expect(screen.getByTestId('unsaved-changes-dialog')).toBeTruthy();

    fireEvent.click(screen.getByTestId('unsaved-changes-discard'));

    await waitFor(() => {
      expect(screen.getByTestId('game-selection-screen')).toBeTruthy();
    });
  });

  it('marks session dirty when runtime move callback is invoked', async () => {
    testDoubles.sessionStore = createMockSessionStore({
      sessionState: {
        screen: 'activeGame',
        gameId: 'fitl',
        seed: 17,
        playerConfig: [{ playerId: 1, type: 'human' }],
        initialMoveHistory: [],
      },
      unsavedChanges: false,
      moveAccumulator: [],
    });
    testDoubles.createSessionStore.mockImplementation(() => testDoubles.sessionStore);

    const { App } = await import('../../src/App.js');

    render(createElement(App));
    const runtimeOptions = testDoubles.useActiveGameRuntime.mock.calls.at(-1)?.[1] as
      | { onMoveApplied?: (move: unknown) => void }
      | undefined;
    const move = { actionId: 'tick', params: {} };
    runtimeOptions?.onMoveApplied?.(move);
    expect(testDoubles.sessionStore?.getState().unsavedChanges).toBe(true);
    expect(testDoubles.sessionStore?.getState().moveAccumulator).toEqual([move]);
  });

  it('resumes non-terminal saved games from selection actions', async () => {
    const { App } = await import('../../src/App.js');

    render(createElement(App));

    fireEvent.click(screen.getByTestId('resume-saved'));

    await waitFor(() => {
      expect(testDoubles.loadGame).toHaveBeenCalledWith('save-1');
    });
    expect(testDoubles.sessionStore?.getState().sessionState).toEqual({
      screen: 'activeGame',
      gameId: 'fitl',
      seed: 17,
      playerConfig: [{ playerId: 1, type: 'human' }],
      initialMoveHistory: [{ actionId: 'tick', params: {} }],
    });
  });

  it('routes to replay screen for replay action and supports back-to-menu', async () => {
    testDoubles.loadGame.mockResolvedValue({
      gameId: 'fitl',
      seed: 17,
      moveHistory: [{ actionId: 'tick', params: {} }],
      playerConfig: [{ playerId: 1, type: 'human' }],
      isTerminal: true,
    });

    const { App } = await import('../../src/App.js');

    render(createElement(App));
    fireEvent.click(screen.getByTestId('replay-saved'));

    await waitFor(() => {
      expect(screen.getByTestId('replay-screen')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('replay-back-to-menu'));
    await waitFor(() => {
      expect(screen.getByTestId('game-selection-screen')).toBeTruthy();
    });
  });
});
