import { describe, expect, it } from 'vitest';
import { asActionId, type Move } from '@ludoforge/engine/runtime';

import { createSessionStore } from '../../src/session/session-store.js';
import type { PlayerSeatConfig } from '../../src/session/session-types.js';

const PLAYER_CONFIG: readonly PlayerSeatConfig[] = [
  { playerId: 0, type: 'human' },
  { playerId: 1, type: 'ai-random' },
];

const MOVE_A: Move = {
  actionId: asActionId('move-a'),
  params: {},
};

const MOVE_B: Move = {
  actionId: asActionId('move-b'),
  params: { target: 'zone-1' },
};

function toPreGame(store: ReturnType<typeof createSessionStore>, gameId = 'fitl'): void {
  store.getState().selectGame(gameId);
}

describe('createSessionStore', () => {
  it('initializes at game selection with clean move state', () => {
    const store = createSessionStore();
    const state = store.getState();

    expect(state.sessionState).toEqual({ screen: 'gameSelection' });
    expect(state.unsavedChanges).toBe(false);
    expect(state.moveAccumulator).toEqual([]);
  });

  it('transitions from game selection to pre-game config via selectGame', () => {
    const store = createSessionStore();

    store.getState().selectGame('fitl');

    expect(store.getState().sessionState).toEqual({
      screen: 'preGameConfig',
      gameId: 'fitl',
    });
  });

  it('transitions from pre-game config to active game via startGame', () => {
    const store = createSessionStore();
    toPreGame(store, 'fitl');

    store.getState().startGame(42, PLAYER_CONFIG);

    expect(store.getState().sessionState).toEqual({
      screen: 'activeGame',
      gameId: 'fitl',
      seed: 42,
      playerConfig: PLAYER_CONFIG,
    });
  });

  it('returnToMenu resets session state and dirty tracking from every screen', () => {
    const gameSelectionStore = createSessionStore();

    gameSelectionStore.getState().recordMove(MOVE_A);
    gameSelectionStore.getState().returnToMenu();
    expect(gameSelectionStore.getState().sessionState).toEqual({ screen: 'gameSelection' });
    expect(gameSelectionStore.getState().unsavedChanges).toBe(false);
    expect(gameSelectionStore.getState().moveAccumulator).toEqual([]);

    const preGameStore = createSessionStore();
    toPreGame(preGameStore);
    preGameStore.getState().recordMove(MOVE_A);
    preGameStore.getState().returnToMenu();
    expect(preGameStore.getState().sessionState).toEqual({ screen: 'gameSelection' });
    expect(preGameStore.getState().unsavedChanges).toBe(false);
    expect(preGameStore.getState().moveAccumulator).toEqual([]);

    const activeStore = createSessionStore();
    toPreGame(activeStore);
    activeStore.getState().startGame(7, PLAYER_CONFIG);
    activeStore.getState().recordMove(MOVE_A);
    activeStore.getState().returnToMenu();
    expect(activeStore.getState().sessionState).toEqual({ screen: 'gameSelection' });
    expect(activeStore.getState().unsavedChanges).toBe(false);
    expect(activeStore.getState().moveAccumulator).toEqual([]);

    const replayStore = createSessionStore();
    replayStore.getState().startReplay('fitl', 17, [MOVE_A]);
    replayStore.getState().recordMove(MOVE_B);
    replayStore.getState().returnToMenu();
    expect(replayStore.getState().sessionState).toEqual({ screen: 'gameSelection' });
    expect(replayStore.getState().unsavedChanges).toBe(false);
    expect(replayStore.getState().moveAccumulator).toEqual([]);
  });

  it('transitions to replay from game selection via startReplay', () => {
    const store = createSessionStore();

    store.getState().startReplay('fitl', 101, [MOVE_A, MOVE_B]);

    expect(store.getState().sessionState).toEqual({
      screen: 'replay',
      gameId: 'fitl',
      seed: 101,
      moveHistory: [MOVE_A, MOVE_B],
    });
  });

  it('transitions from active game to pre-game config via newGame with same game id', () => {
    const store = createSessionStore();
    toPreGame(store, 'texas-holdem');
    store.getState().startGame(55, PLAYER_CONFIG);

    store.getState().newGame();

    expect(store.getState().sessionState).toEqual({
      screen: 'preGameConfig',
      gameId: 'texas-holdem',
    });
  });

  it('recordMove appends move and marks unsaved changes', () => {
    const store = createSessionStore();

    store.getState().recordMove(MOVE_A);
    store.getState().recordMove(MOVE_B);

    expect(store.getState().moveAccumulator).toEqual([MOVE_A, MOVE_B]);
    expect(store.getState().unsavedChanges).toBe(true);
  });

  it('markSaved clears dirty flag without clearing move accumulator', () => {
    const store = createSessionStore();

    store.getState().recordMove(MOVE_A);
    store.getState().markSaved();

    expect(store.getState().unsavedChanges).toBe(false);
    expect(store.getState().moveAccumulator).toEqual([MOVE_A]);
  });

  it('throws for selectGame from activeGame', () => {
    const store = createSessionStore();
    toPreGame(store, 'fitl');
    store.getState().startGame(42, PLAYER_CONFIG);

    expect(() => store.getState().selectGame('texas-holdem')).toThrow(/Invalid session transition for selectGame/u);
  });

  it('throws for startGame from gameSelection', () => {
    const store = createSessionStore();

    expect(() => store.getState().startGame(42, PLAYER_CONFIG)).toThrow(/Invalid session transition for startGame/u);
  });

  it('throws for newGame from replay', () => {
    const store = createSessionStore();
    store.getState().startReplay('fitl', 88, [MOVE_A]);

    expect(() => store.getState().newGame()).toThrow(/Invalid session transition for newGame/u);
  });

  it('creates independent store instances', () => {
    const a = createSessionStore();
    const b = createSessionStore();

    a.getState().selectGame('fitl');
    a.getState().recordMove(MOVE_A);

    expect(a.getState().sessionState).toEqual({ screen: 'preGameConfig', gameId: 'fitl' });
    expect(a.getState().moveAccumulator).toEqual([MOVE_A]);
    expect(b.getState().sessionState).toEqual({ screen: 'gameSelection' });
    expect(b.getState().moveAccumulator).toEqual([]);
    expect(b.getState().unsavedChanges).toBe(false);
  });
});
