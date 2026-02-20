// @vitest-environment jsdom

import { createElement } from 'react';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface SessionStoreState {
  readonly sessionState:
    | { readonly screen: 'gameSelection' }
    | { readonly screen: 'preGameConfig'; readonly gameId: string }
    | { readonly screen: 'activeGame'; readonly gameId: string; readonly seed: number; readonly playerConfig: ReadonlyArray<{ readonly playerId: number; readonly type: 'human' | 'ai-random' | 'ai-greedy' }> }
    | { readonly screen: 'replay'; readonly gameId: string; readonly seed: number; readonly moveHistory: readonly unknown[] };
  readonly unsavedChanges: boolean;
  readonly moveAccumulator: readonly unknown[];
  selectGame(gameId: string): void;
  startGame(seed: number, playerConfig: ReadonlyArray<{ readonly playerId: number; readonly type: 'human' | 'ai-random' | 'ai-greedy' }>): void;
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
  createSessionStore: vi.fn(),
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
        },
        unsavedChanges: false,
        moveAccumulator: [],
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

vi.mock('../../src/session/session-store.js', () => ({
  createSessionStore: testDoubles.createSessionStore,
}));

vi.mock('../../src/ui/GameContainer.js', () => ({
  GameContainer: (props: { readonly onReturnToMenu?: () => void; readonly onQuit?: () => void; readonly onNewGame?: () => void }) => (
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
    )
  ),
}));

vi.mock('../../src/ui/ErrorBoundary.js', () => ({
  ErrorBoundary: (props: { readonly children: ReactNode }) => createElement('section', { 'data-testid': 'error-boundary' }, props.children),
}));

vi.mock('../../src/ui/GameSelectionScreen.js', () => ({
  GameSelectionScreen: (props: { readonly onSelectGame: (gameId: string) => void }) => (
    createElement('main', { 'data-testid': 'game-selection-screen' },
      createElement('button', {
        type: 'button',
        'data-testid': 'select-game-fitl',
        onClick: () => {
          props.onSelectGame('fitl');
        },
      }, 'select-fitl'),
    )
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
    testDoubles.createSessionStore.mockReset();

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

    testDoubles.sessionStore = createMockSessionStore();
    testDoubles.createSessionStore.mockImplementation(() => testDoubles.sessionStore);
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
});
