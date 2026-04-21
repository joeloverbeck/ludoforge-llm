import { describe, expect, it, vi } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import { asActionId, asPlayerId, initialState, type GameDef, type Move } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { createAgentSeatController, createHumanSeatController } from '../../src/seat/seat-controller.js';
import { createGameStore } from '../../src/store/game-store.js';
import { createGameWorker } from '../../src/worker/game-worker-api.js';
import { CHOOSE_MIXED_TEST_DEF } from '../worker/test-fixtures.js';
import type { PlayerSeatConfig } from '../../src/session/session-types.js';

const TWO_PLAYER_CONFIG: readonly PlayerSeatConfig[] = [
  { playerId: 0, controller: createHumanSeatController() },
  { playerId: 1, controller: createAgentSeatController({ kind: 'builtin', builtinId: 'random' }) },
];

const AI_FIRST_CONFIG: readonly PlayerSeatConfig[] = [
  { playerId: 0, controller: createAgentSeatController({ kind: 'builtin', builtinId: 'greedy' }) },
  { playerId: 1, controller: createHumanSeatController() },
];

function compileCounterFixture(terminalThreshold: number): GameDef {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-game-store-test',
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

function createStore(onMoveApplied?: (move: Move) => void) {
  return createGameStore(
    createGameWorker(),
    new VisualConfigProvider(null),
    onMoveApplied === undefined ? undefined : { onMoveApplied },
  );
}

describe('createGameStore', () => {
  it('initGame populates state, runner projection, and current microturn', async () => {
    const def = compileCounterFixture(5);
    const store = createStore();

    await store.getState().initGame(def, 11, TWO_PLAYER_CONFIG);

    const state = store.getState();
    expect(state.gameLifecycle).toBe('playing');
    expect(state.gameDef).toEqual(def);
    expect(state.playerID).toEqual(asPlayerId(0));
    expect(state.currentMicroturn?.kind).toBe('actionSelection');
    expect(state.legalMoveResult?.moves).toHaveLength(1);
    expect(state.runnerFrame?.selectedActionId).toBeNull();
    expect(state.renderModel).not.toBeNull();
  });

  it('submitActionSelection immediately submits actionSelection decisions for simple actions', async () => {
    const def = compileCounterFixture(5);
    const onMoveApplied = vi.fn();
    const store = createStore(onMoveApplied);
    await store.getState().initGame(def, 13, TWO_PLAYER_CONFIG);

    await store.getState().submitActionSelection('tick');

    const state = store.getState();
    expect(state.gameState?.globalVars.round).toBe(1);
    expect(state.currentMicroturn?.kind).toBe('actionSelection');
    expect(onMoveApplied).toHaveBeenCalledWith({ actionId: asActionId('tick'), params: {} });
  });

  it('projects progressive chooseOne -> chooseN flow from currentMicroturn', async () => {
    const store = createStore();
    await store.getState().initGame(CHOOSE_MIXED_TEST_DEF, 21, TWO_PLAYER_CONFIG);

    await store.getState().submitActionSelection('pick-mixed');
    expect(store.getState().currentMicroturn?.kind).toBe('chooseOne');
    expect(store.getState().renderModel?.choiceUi.kind).toBe('discreteOne');

    await store.getState().submitChoice('x');
    expect(store.getState().currentMicroturn?.kind).toBe('chooseNStep');
    expect(store.getState().renderModel?.choiceUi.kind).toBe('discreteMany');
    expect(store.getState().renderModel?.choiceBreadcrumb).toHaveLength(1);
    const selectedKey = store.getState().renderModel?.choiceBreadcrumb[0]?.decisionKey;
    expect(selectedKey).toBeDefined();
    expect(store.getState().runnerFrame?.selectedActionId).toBe('pick-mixed');

    await store.getState().submitChooseNStep('add', 'm1');
    const choiceUi = store.getState().renderModel?.choiceUi;
    expect(choiceUi?.kind).toBe('discreteMany');
    if (choiceUi?.kind !== 'discreteMany') {
      throw new Error('Expected chooseN choice UI.');
    }
    expect(choiceUi.selectedChoiceValueIds).toEqual(['s:2:m1']);

    await store.getState().submitChooseNStep('confirm');
    expect(store.getState().currentMicroturn?.kind).toBe('actionSelection');
    expect(store.getState().renderModel?.choiceUi.kind).toBe('none');
  });

  it('rewindToCurrentTurnStart rewinds the whole current turn', async () => {
    const store = createStore();
    await store.getState().initGame(CHOOSE_MIXED_TEST_DEF, 31, TWO_PLAYER_CONFIG);

    await store.getState().submitActionSelection('pick-mixed');
    await store.getState().submitChoice('x');
    expect(store.getState().currentMicroturn?.kind).toBe('chooseNStep');

    await store.getState().rewindToCurrentTurnStart();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().currentMicroturn?.kind).toBe('actionSelection');
    expect(store.getState().renderModel?.choiceUi.kind).toBe('none');
  });

  it('hydrateFromReplayStep swaps in the replay frontier and clears move construction state', async () => {
    const def = compileCounterFixture(5);
    const store = createStore();
    await store.getState().initGame(def, 41, TWO_PLAYER_CONFIG);
    await store.getState().submitActionSelection('tick');

    const replayState = initialState(def, 99, 2).state;
    store.getState().hydrateFromReplayStep(replayState, null, null, [], []);

    const state = store.getState();
    expect(state.gameState).toEqual(replayState);
    expect(state.currentMicroturn).toBeNull();
    expect(state.renderModel?.choiceUi.kind).toBe('none');
  });

  it('runAiStep advances one published decision and reports completed moves', async () => {
    const def = compileCounterFixture(5);
    const onMoveApplied = vi.fn();
    const store = createStore(onMoveApplied);
    await store.getState().initGame(def, 51, AI_FIRST_CONFIG);

    expect(store.getState().renderModel?.activePlayerID).toEqual(asPlayerId(0));
    const outcome = await store.getState().runAiStep();

    expect(outcome).toBe('advanced');
    expect(store.getState().gameState?.globalVars.round).toBe(1);
    expect(onMoveApplied).toHaveBeenCalledTimes(1);
    expect(store.getState().renderModel?.activePlayerID).toEqual(asPlayerId(1));
  });
});
