import type { Move } from '@ludoforge/engine/runtime';
import { create } from 'zustand';

import type {
  ActiveGameState,
  AppScreen,
  PlayerSeatConfig,
  PreGameConfigState,
  SessionState,
} from './session-types.js';

interface SessionStoreState {
  readonly sessionState: SessionState;
  readonly unsavedChanges: boolean;
  readonly moveAccumulator: readonly Move[];
}

interface SessionStoreActions {
  selectGame(gameId: string): void;
  startGame(seed: number, playerConfig: readonly PlayerSeatConfig[]): void;
  returnToMenu(): void;
  startReplay(gameId: string, seed: number, moveHistory: readonly Move[]): void;
  newGame(): void;
  recordMove(move: Move): void;
  markSaved(): void;
}

export type SessionStore = SessionStoreState & SessionStoreActions;

const SESSION_MENU_STATE: SessionState = { screen: 'gameSelection' };

function buildTransitionError(
  action: string,
  from: AppScreen,
  allowedFrom: readonly AppScreen[],
): Error {
  const allowed = allowedFrom.join(', ');
  return new Error(`Invalid session transition for ${action}: from ${from}. Allowed from: ${allowed}`);
}

function assertTransitionAllowed(
  action: string,
  from: AppScreen,
  allowedFrom: readonly AppScreen[],
): void {
  if (allowedFrom.includes(from)) {
    return;
  }

  throw buildTransitionError(action, from, allowedFrom);
}

function expectPreGameConfigState(state: SessionState, action: string): PreGameConfigState {
  if (state.screen !== 'preGameConfig') {
    throw buildTransitionError(action, state.screen, ['preGameConfig']);
  }
  return state;
}

function expectActiveGameState(state: SessionState, action: string): ActiveGameState {
  if (state.screen !== 'activeGame') {
    throw buildTransitionError(action, state.screen, ['activeGame']);
  }
  return state;
}

export function createSessionStore() {
  return create<SessionStore>()((set, get) => ({
    sessionState: SESSION_MENU_STATE,
    unsavedChanges: false,
    moveAccumulator: [],

    selectGame(gameId) {
      const current = get().sessionState;
      assertTransitionAllowed('selectGame', current.screen, ['gameSelection']);
      set({
        sessionState: {
          screen: 'preGameConfig',
          gameId,
        },
      });
    },

    startGame(seed, playerConfig) {
      const current = expectPreGameConfigState(get().sessionState, 'startGame');
      set({
        sessionState: {
          screen: 'activeGame',
          gameId: current.gameId,
          seed,
          playerConfig: [...playerConfig],
        },
        unsavedChanges: false,
        moveAccumulator: [],
      });
    },

    returnToMenu() {
      set({
        sessionState: SESSION_MENU_STATE,
        unsavedChanges: false,
        moveAccumulator: [],
      });
    },

    startReplay(gameId, seed, moveHistory) {
      const current = get().sessionState;
      assertTransitionAllowed('startReplay', current.screen, ['gameSelection']);
      set({
        sessionState: {
          screen: 'replay',
          gameId,
          seed,
          moveHistory: [...moveHistory],
        },
        unsavedChanges: false,
        moveAccumulator: [],
      });
    },

    newGame() {
      const current = expectActiveGameState(get().sessionState, 'newGame');
      set({
        sessionState: {
          screen: 'preGameConfig',
          gameId: current.gameId,
        },
        unsavedChanges: false,
        moveAccumulator: [],
      });
    },

    recordMove(move) {
      set((state) => ({
        moveAccumulator: [...state.moveAccumulator, move],
        unsavedChanges: true,
      }));
    },

    markSaved() {
      set({ unsavedChanges: false });
    },
  }));
}
