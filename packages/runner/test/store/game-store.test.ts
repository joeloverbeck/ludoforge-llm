import { describe, expect, it, vi } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import { asActionId, asPlayerId, initialState, type GameDef, type Move } from '@ludoforge/engine';

import { createGameStore } from '../../src/store/game-store.js';
import { createGameWorker, type GameWorkerAPI, type WorkerError } from '../../src/worker/game-worker-api.js';

function compileStoreFixture(terminalThreshold: number): GameDef {
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
      {
        id: 'reserve',
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
      {
        id: 'pick-two',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [
          {
            name: 'firstZone',
            domain: { query: 'zones' },
          },
          {
            name: 'secondZone',
            domain: { query: 'zones' },
          },
        ],
        pre: null,
        cost: [],
        effects: [],
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

function pickOneOption(store: ReturnType<typeof createGameStore>): Move['params'][string] {
  const pending = store.getState().choicePending;
  if (pending === null) {
    throw new Error('Expected pending choice options.');
  }
  return pending.options[0]!;
}

function createBridgeStub(overrides: Partial<GameWorkerAPI>): GameWorkerAPI {
  const fallbackError = (): never => {
    throw new Error('Unexpected bridge call in test stub.');
  };

  return {
    init: overrides.init ?? fallbackError,
    legalMoves: overrides.legalMoves ?? fallbackError,
    enumerateLegalMoves: overrides.enumerateLegalMoves ?? fallbackError,
    legalChoices: overrides.legalChoices ?? fallbackError,
    applyMove: overrides.applyMove ?? fallbackError,
    playSequence: overrides.playSequence ?? fallbackError,
    terminalResult: overrides.terminalResult ?? fallbackError,
    getState: overrides.getState ?? fallbackError,
    getMetadata: overrides.getMetadata ?? fallbackError,
    getHistoryLength: overrides.getHistoryLength ?? fallbackError,
    undo: overrides.undo ?? fallbackError,
    reset: overrides.reset ?? fallbackError,
    loadFromUrl: overrides.loadFromUrl ?? fallbackError,
  };
}

function createChoiceBridgeStub(def: GameDef): GameWorkerAPI {
  const state = initialState(def, 100, 2);
  const legalMove = { actionId: asActionId('pick-two'), params: {} };
  const validChoices = new Set(['table:none', 'reserve:none']);

  return createBridgeStub({
    init: () => state,
    enumerateLegalMoves: () => ({
      moves: [legalMove],
      warnings: [],
    }),
    terminalResult: () => null,
    legalChoices: (partialMove) => {
      const firstZone = partialMove.params.firstZone;
      const secondZone = partialMove.params.secondZone;
      if (firstZone === undefined) {
        return {
          kind: 'pending',
          complete: false,
          decisionId: 'decision:first',
          name: 'firstZone',
          type: 'chooseOne',
          options: ['table:none', 'reserve:none'],
        };
      }

      if (typeof firstZone !== 'string' || !validChoices.has(firstZone)) {
        return {
          kind: 'illegal',
          complete: false,
          reason: 'pipelineLegalityFailed',
        };
      }

      if (secondZone === undefined) {
        return {
          kind: 'pending',
          complete: false,
          decisionId: 'decision:second',
          name: 'secondZone',
          type: 'chooseOne',
          options: ['table:none', 'reserve:none'],
        };
      }

      if (typeof secondZone !== 'string' || !validChoices.has(secondZone)) {
        return {
          kind: 'illegal',
          complete: false,
          reason: 'pipelineLegalityFailed',
        };
      }

      return {
        kind: 'complete',
        complete: true,
      };
    },
  });
}

describe('createGameStore', () => {
  it('initGame populates state and enters playing lifecycle', () => {
    const def = compileStoreFixture(5);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);

    store.getState().initGame(def, 11, asPlayerId(0));
    const state = store.getState();

    expect(state.gameDef).toEqual(def);
    expect(state.gameState).not.toBeNull();
    expect(state.playerID).toEqual(asPlayerId(0));
    expect(state.legalMoveResult).not.toBeNull();
    expect(state.renderModel).not.toBeNull();
    expect(state.gameLifecycle).toBe('playing');
    expect(state.loading).toBe(false);
  });

  it('initGame with terminal state enters terminal lifecycle', () => {
    const def = compileStoreFixture(0);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);

    store.getState().initGame(def, 12, asPlayerId(0));

    expect(store.getState().terminal).not.toBeNull();
    expect(store.getState().gameLifecycle).toBe('terminal');
  });

  it('selectAction initializes progressive choice state from legalChoices', () => {
    const def = compileStoreFixture(5);
    const bridge = createChoiceBridgeStub(def);
    const store = createGameStore(bridge);
    store.getState().initGame(def, 13, asPlayerId(0));

    store.getState().selectAction(asActionId('pick-two'));
    const state = store.getState();

    expect(state.selectedAction).toEqual(asActionId('pick-two'));
    expect(state.partialMove).toEqual({
      actionId: asActionId('pick-two'),
      params: {},
    });
    expect(state.choiceStack).toEqual([]);
    expect(state.choicePending?.kind).toBe('pending');
  });

  it('makeChoice advances pending -> complete and stores breadcrumb choices', () => {
    const def = compileStoreFixture(5);
    const bridge = createChoiceBridgeStub(def);
    const store = createGameStore(bridge);
    store.getState().initGame(def, 14, asPlayerId(0));
    store.getState().selectAction(asActionId('pick-two'));

    const firstChoice = pickOneOption(store);
    store.getState().makeChoice(firstChoice);
    expect(store.getState().choiceStack).toHaveLength(1);
    expect(store.getState().choicePending?.kind).toBe('pending');

    const secondChoice = pickOneOption(store);
    store.getState().makeChoice(secondChoice);

    const state = store.getState();
    expect(state.choicePending).toBeNull();
    expect(state.choiceStack).toHaveLength(2);
    expect(state.partialMove?.params).toEqual({
      firstZone: firstChoice,
      secondZone: secondChoice,
    });
  });

  it('makeChoice illegal sets error and preserves previous move construction', () => {
    const def = compileStoreFixture(5);
    const bridge = createChoiceBridgeStub(def);
    const store = createGameStore(bridge);
    store.getState().initGame(def, 15, asPlayerId(0));
    store.getState().selectAction(asActionId('pick-two'));

    const before = store.getState();
    store.getState().makeChoice('unknown-zone');
    const after = store.getState();

    expect(after.error).toMatchObject({ code: 'ILLEGAL_MOVE' });
    expect(after.choiceStack).toEqual(before.choiceStack);
    expect(after.partialMove).toEqual(before.partialMove);
    expect(after.choicePending).toEqual(before.choicePending);
  });

  it('confirmMove applies move, refreshes state, and resets move construction', () => {
    const def = compileStoreFixture(5);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    store.getState().initGame(def, 16, asPlayerId(0));
    store.getState().selectAction(asActionId('tick'));

    store.getState().confirmMove();
    const state = store.getState();

    expect(state.gameState?.globalVars.round).toBe(1);
    expect(state.legalMoveResult).not.toBeNull();
    expect(state.renderModel).not.toBeNull();
    expect(state.selectedAction).toBeNull();
    expect(state.partialMove).toBeNull();
    expect(state.choiceStack).toEqual([]);
    expect(state.choicePending).toBeNull();
  });

  it('confirmMove is a no-op when no partialMove is selected', () => {
    const def = compileStoreFixture(5);
    const bridge = createGameWorker();
    const applySpy = vi.spyOn(bridge, 'applyMove');
    const store = createGameStore(bridge);
    store.getState().initGame(def, 17, asPlayerId(0));

    store.getState().confirmMove();

    expect(applySpy).not.toHaveBeenCalled();
  });

  it('cancelChoice pops one choice and re-queries pending decision', () => {
    const def = compileStoreFixture(5);
    const bridge = createChoiceBridgeStub(def);
    const store = createGameStore(bridge);
    store.getState().initGame(def, 18, asPlayerId(0));
    store.getState().selectAction(asActionId('pick-two'));

    store.getState().makeChoice(pickOneOption(store));
    store.getState().makeChoice(pickOneOption(store));
    expect(store.getState().choicePending).toBeNull();

    store.getState().cancelChoice();

    expect(store.getState().choiceStack).toHaveLength(1);
    expect(store.getState().choicePending?.kind).toBe('pending');
  });

  it('cancelChoice with empty stack is a no-op', () => {
    const def = compileStoreFixture(5);
    const bridge = createGameWorker();
    const legalChoicesSpy = vi.spyOn(bridge, 'legalChoices');
    const store = createGameStore(bridge);
    store.getState().initGame(def, 19, asPlayerId(0));
    store.getState().selectAction(asActionId('tick'));
    const callsBefore = legalChoicesSpy.mock.calls.length;

    store.getState().cancelChoice();

    expect(legalChoicesSpy).toHaveBeenCalledTimes(callsBefore);
    expect(store.getState().choiceStack).toEqual([]);
  });

  it('undo restores previous state and transitions terminal -> playing', () => {
    const def = compileStoreFixture(1);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    store.getState().initGame(def, 20, asPlayerId(0));
    store.getState().selectAction(asActionId('tick'));
    store.getState().confirmMove();
    expect(store.getState().gameLifecycle).toBe('terminal');

    store.getState().undo();

    expect(store.getState().gameLifecycle).toBe('playing');
    expect(store.getState().gameState?.globalVars.round).toBe(0);
    expect(store.getState().legalMoveResult).not.toBeNull();
  });

  it('undo with no history is a no-op', () => {
    const def = compileStoreFixture(5);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    store.getState().initGame(def, 21, asPlayerId(0));
    const before = store.getState().gameState;

    store.getState().undo();

    expect(store.getState().gameState).toEqual(before);
  });

  it('loading brackets bridge calls during initGame', () => {
    const def = compileStoreFixture(5);
    const bridge = createGameWorker();
    const baseState = initialState(def, 22, 2);
    const originalEnumerate = bridge.enumerateLegalMoves.bind(bridge);
    const initSpy = vi.spyOn(bridge, 'init').mockImplementation(() => baseState);
    const enumerateSpy = vi.spyOn(bridge, 'enumerateLegalMoves');
    let store!: ReturnType<typeof createGameStore>;

    enumerateSpy.mockImplementation((options) => {
      expect(store.getState().loading).toBe(true);
      return originalEnumerate(options);
    });

    store = createGameStore(bridge);
    store.getState().initGame(def, 22, asPlayerId(0));

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(enumerateSpy).toHaveBeenCalledTimes(1);
    expect(store.getState().loading).toBe(false);
  });

  it('bridge errors are captured as WorkerError and clearError resets them', () => {
    const def = compileStoreFixture(5);
    const workerError: WorkerError = {
      code: 'VALIDATION_FAILED',
      message: 'bad game definition',
    };
    const bridge = createBridgeStub({
      init: () => {
        throw workerError;
      },
      enumerateLegalMoves: () => ({ moves: [], warnings: [] }),
      terminalResult: () => null,
    });

    const store = createGameStore(bridge);
    store.getState().initGame(def, 23, asPlayerId(0));

    expect(store.getState().error).toEqual(workerError);
    expect(store.getState().loading).toBe(false);
    store.getState().clearError();
    expect(store.getState().error).toBeNull();
  });

  it('setAnimationPlaying toggles animation flag', () => {
    const store = createGameStore(createGameWorker());
    expect(store.getState().animationPlaying).toBe(false);

    store.getState().setAnimationPlaying(true);
    expect(store.getState().animationPlaying).toBe(true);

    store.getState().setAnimationPlaying(false);
    expect(store.getState().animationPlaying).toBe(false);
  });
});
