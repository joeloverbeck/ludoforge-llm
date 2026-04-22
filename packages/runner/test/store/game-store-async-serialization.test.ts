import { describe, expect, it, vi } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import { asPlayerId, initialState, type GameDef } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { createAgentSeatController, createHumanSeatController } from '../../src/seat/seat-controller.js';
import type { PlayerSeatConfig } from '../../src/session/session-types.js';
import { createGameStore } from '../../src/store/game-store.js';
import { createGameWorker } from '../../src/worker/game-worker-api.js';

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

function compileCounterFixture(): GameDef {
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
          when: { op: '>=', left: { ref: 'gvar', var: 'round' }, right: 5 },
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

const P0_HUMAN_CONFIG: readonly PlayerSeatConfig[] = [
  { playerId: 0, controller: createHumanSeatController() },
  { playerId: 1, controller: createAgentSeatController() },
];

const P1_HUMAN_CONFIG: readonly PlayerSeatConfig[] = [
  { playerId: 0, controller: createAgentSeatController() },
  { playerId: 1, controller: createHumanSeatController() },
];

function createStore(bridge: ReturnType<typeof createGameWorker>) {
  return createGameStore(bridge, new VisualConfigProvider(null));
}

describe('createGameStore async serialization', () => {
  it('initGame called twice quickly keeps only the newest initialization result', async () => {
    const def = compileCounterFixture();
    const bridge = createGameWorker();
    const store = createStore(bridge);
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

    const initA = store.getState().initGame(def, 101, P0_HUMAN_CONFIG);
    const initB = store.getState().initGame(def, 202, P1_HUMAN_CONFIG);

    gateA.resolve();
    await initA;
    expect(store.getState().loading).toBe(true);

    gateB.resolve();
    await initB;

    const state = store.getState();
    expect(state.playerID).toEqual(asPlayerId(1));
    expect(state.loading).toBe(false);
    expect(state.gameLifecycle).toBe('playing');
    expect(state.gameState).toEqual(initialState(def, 202).state);
  });

  it('stale submitActionSelection completion after a newer initGame does not mutate the new session', async () => {
    const def = compileCounterFixture();
    const bridge = createGameWorker();
    const store = createStore(bridge);
    await store.getState().initGame(def, 10, P0_HUMAN_CONFIG);

    const baseApplyDecision = bridge.applyDecision.bind(bridge);
    const gate = createDeferred<void>();
    vi.spyOn(bridge, 'applyDecision').mockImplementationOnce(async (decision, options, stamp) => {
      await gate.promise;
      return await baseApplyDecision(decision, options, stamp);
    });

    const selectPromise = store.getState().submitActionSelection('tick');
    const newerInitPromise = store.getState().initGame(def, 99, P1_HUMAN_CONFIG);

    gate.resolve();
    await Promise.all([selectPromise, newerInitPromise]);

    const state = store.getState();
    expect(state.playerID).toEqual(asPlayerId(1));
    expect(state.gameState).toEqual(initialState(def, 99).state);
    expect(state.gameState?.globalVars.round).toBe(0);
  });
});
