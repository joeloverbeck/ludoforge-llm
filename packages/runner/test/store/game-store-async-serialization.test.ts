import { describe, expect, it, vi } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import { asActionId, asPlayerId, initialState, type GameDef } from '@ludoforge/engine/runtime';

import { createGameStore } from '../../src/store/game-store.js';
import { createGameWorker, type WorkerError } from '../../src/worker/game-worker-api.js';
import { CHOOSE_MIXED_TEST_DEF } from '../worker/test-fixtures.js';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: ((value: T | PromiseLike<T>) => void) | null = null;
  let reject: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  if (resolve === null || reject === null) {
    throw new Error('Deferred initialization failed.');
  }
  return { promise, resolve, reject };
}

function compileCounterFixture(terminalThreshold: number): GameDef {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-async-serialization',
      players: {
        min: 2,
        max: 2,
      },
    },
    globalVars: [
      {
        name: 'round',
        type: 'int',
        init: 0,
        min: 0,
        max: 10,
      },
    ],
    zones: [
      {
        id: 'table',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
      },
    ],
    turnStructure: {
      phases: [{ id: 'main' }],
    },
    actions: [
      {
        id: 'tick',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'round', delta: 1 } }],
        limits: [],
      },
    ],
    terminal: {
      conditions: [
        {
          when: { op: '>=', left: { ref: 'gvar', var: 'round' }, right: terminalThreshold },
          result: { type: 'draw' },
        },
      ],
    },
  });

  if (compiled.gameDef === null) {
    throw new Error(`Expected fixture to compile: ${JSON.stringify(compiled.diagnostics)}`);
  }
  return compiled.gameDef;
}

describe('createGameStore async serialization', () => {
  it('initGame called twice quickly keeps only the newest initialization result', async () => {
    const def = compileCounterFixture(5);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    const baseInit = bridge.init.bind(bridge);
    const gateA = createDeferred<void>();
    const gateB = createDeferred<void>();

    vi.spyOn(bridge, 'init')
      .mockImplementationOnce(async (nextDef, seed, options, stamp) => {
        await gateA.promise;
        return await baseInit(nextDef, seed, options, stamp);
      })
      .mockImplementationOnce(async (nextDef, seed, options, stamp) => {
        await gateB.promise;
        return await baseInit(nextDef, seed, options, stamp);
      });

    const initA = store.getState().initGame(def, 101, asPlayerId(0));
    const initB = store.getState().initGame(def, 202, asPlayerId(1));

    gateA.resolve();
    await initA;
    expect(store.getState().loading).toBe(true);

    gateB.resolve();
    await initB;

    const state = store.getState();
    expect(state.playerID).toEqual(asPlayerId(1));
    expect(state.loading).toBe(false);
    expect(state.gameLifecycle).toBe('playing');
    expect(state.gameState).toEqual(initialState(def, 202));
  });

  it('stale selectAction result after cancelMove does not restore choice state', async () => {
    const def = compileCounterFixture(5);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(def, 1, asPlayerId(0));

    const baseLegalChoices = bridge.legalChoices.bind(bridge);
    const gate = createDeferred<void>();
    vi.spyOn(bridge, 'legalChoices').mockImplementationOnce(async (move) => {
      await gate.promise;
      return await baseLegalChoices(move);
    });

    const selectPromise = store.getState().selectAction(asActionId('tick'));
    store.getState().cancelMove();
    gate.resolve();
    await selectPromise;

    const state = store.getState();
    expect(state.selectedAction).toBeNull();
    expect(state.partialMove).toBeNull();
    expect(state.choicePending).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('stale confirmMove completion after newer initGame does not mutate the new session', async () => {
    const def = compileCounterFixture(5);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(def, 10, asPlayerId(0));
    await store.getState().selectAction(asActionId('tick'));

    const baseApplyMove = bridge.applyMove.bind(bridge);
    const gate = createDeferred<void>();
    vi.spyOn(bridge, 'applyMove').mockImplementationOnce(async (move, options, stamp) => {
      await gate.promise;
      return await baseApplyMove(move, options, stamp);
    });

    const confirmPromise = store.getState().confirmMove();
    const newerInitPromise = store.getState().initGame(def, 99, asPlayerId(1));

    gate.resolve();
    await Promise.all([confirmPromise, newerInitPromise]);

    const state = store.getState();
    expect(state.playerID).toEqual(asPlayerId(1));
    expect(state.gameState).toEqual(initialState(def, 99));
    expect(state.gameState?.globalVars.round).toBe(0);
    expect(state.effectTrace).toEqual([]);
    expect(state.triggerFirings).toEqual([]);
  });

  it('stale chooseOne completion after newer selectAction does not mutate current move construction', async () => {
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(CHOOSE_MIXED_TEST_DEF, 31, asPlayerId(0));
    await store.getState().selectAction(asActionId('pick-mixed'));

    const baseLegalChoices = bridge.legalChoices.bind(bridge);
    const gate = createDeferred<void>();
    vi.spyOn(bridge, 'legalChoices').mockImplementationOnce(async (move) => {
      await gate.promise;
      return await baseLegalChoices(move);
    });

    const staleChooseOne = store.getState().chooseOne('x');
    const newerSelectAction = store.getState().selectAction(asActionId('pick-mixed'));
    await newerSelectAction;

    gate.resolve();
    await staleChooseOne;

    const state = store.getState();
    expect(state.selectedAction).toEqual(asActionId('pick-mixed'));
    expect(state.choiceStack).toEqual([]);
    expect(state.partialMove).toEqual({
      actionId: asActionId('pick-mixed'),
      params: {},
    });
    expect(state.choicePending?.type).toBe('chooseOne');
    expect(state.choicePending?.decisionId.startsWith('decision:')).toBe(true);
    expect(state.error).toBeNull();
  });

  it('stale chooseN completion after newer selectAction does not mutate current move construction', async () => {
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(CHOOSE_MIXED_TEST_DEF, 32, asPlayerId(0));
    await store.getState().selectAction(asActionId('pick-mixed'));
    await store.getState().chooseOne('x');
    expect(store.getState().choicePending?.type).toBe('chooseN');

    const baseLegalChoices = bridge.legalChoices.bind(bridge);
    const gate = createDeferred<void>();
    vi.spyOn(bridge, 'legalChoices').mockImplementationOnce(async (move) => {
      await gate.promise;
      return await baseLegalChoices(move);
    });

    const staleChooseN = store.getState().chooseN(['m1']);
    const newerSelectAction = store.getState().selectAction(asActionId('pick-mixed'));
    await newerSelectAction;

    gate.resolve();
    await staleChooseN;

    const state = store.getState();
    expect(state.selectedAction).toEqual(asActionId('pick-mixed'));
    expect(state.choiceStack).toEqual([]);
    expect(state.partialMove).toEqual({
      actionId: asActionId('pick-mixed'),
      params: {},
    });
    expect(state.choicePending?.type).toBe('chooseOne');
    expect(state.choicePending?.decisionId.startsWith('decision:')).toBe(true);
    expect(state.error).toBeNull();
  });

  it('stale confirmMove completion after undo does not mutate current state', async () => {
    const def = compileCounterFixture(10);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(def, 33, asPlayerId(0));

    await store.getState().selectAction(asActionId('tick'));
    await store.getState().confirmMove();
    expect(store.getState().gameState?.globalVars.round).toBe(1);

    await store.getState().selectAction(asActionId('tick'));

    const baseApplyMove = bridge.applyMove.bind(bridge);
    const gate = createDeferred<void>();
    vi.spyOn(bridge, 'applyMove').mockImplementationOnce(async (move, options, stamp) => {
      await gate.promise;
      return await baseApplyMove(move, options, stamp);
    });

    const staleConfirmMove = store.getState().confirmMove();
    const undoPromise = store.getState().undo();
    await undoPromise;
    expect(store.getState().gameState?.globalVars.round).toBe(0);

    gate.resolve();
    await staleConfirmMove;

    const state = store.getState();
    expect(state.gameState?.globalVars.round).toBe(0);
    expect(state.effectTrace).toEqual([]);
    expect(state.triggerFirings).toEqual([]);
    expect(state.error).toBeNull();

    await store.getState().selectAction(asActionId('tick'));
    await store.getState().confirmMove();
    expect(store.getState().gameState?.globalVars.round).toBe(1);
  });

  it('stale rejection does not overwrite current-session success/error state', async () => {
    const def = compileCounterFixture(5);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(def, 7, asPlayerId(0));

    const baseLegalChoices = bridge.legalChoices.bind(bridge);
    const gate = createDeferred<void>();
    const staleError: WorkerError = {
      code: 'INTERNAL_ERROR',
      message: 'stale failure',
    };

    vi.spyOn(bridge, 'legalChoices')
      .mockImplementationOnce(async () => {
        await gate.promise;
        throw staleError;
      })
      .mockImplementationOnce(async (move) => {
        return await baseLegalChoices(move);
      });

    const staleSelect = store.getState().selectAction(asActionId('tick'));
    const currentSelect = store.getState().selectAction(asActionId('tick'));

    await currentSelect;
    gate.resolve();
    await staleSelect;

    const state = store.getState();
    expect(state.selectedAction).toEqual(asActionId('tick'));
    expect(state.error).toBeNull();
    expect(state.gameLifecycle).toBe('playing');
  });
});
