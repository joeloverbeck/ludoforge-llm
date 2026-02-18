import { describe, expect, it, vi } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import {
  asActionId,
  asPlayerId,
  asTriggerId,
  initialState,
  type EffectTraceEntry,
  type GameDef,
  type Move,
  type TriggerLogEntry,
} from '@ludoforge/engine/runtime';

import { createGameStore } from '../../src/store/game-store.js';
import { createGameWorker, type GameWorkerAPI, type WorkerError } from '../../src/worker/game-worker-api.js';
import { CHOOSE_MIXED_TEST_DEF, CHOOSE_N_TEST_DEF, CHOOSE_ONE_TEST_DEF } from '../worker/test-fixtures.js';

type ChoiceScalar = Exclude<Move['params'][string], readonly unknown[]>;

function isChoiceScalar(value: Move['params'][string]): value is ChoiceScalar {
  return !Array.isArray(value);
}

function asChoiceScalar(value: Move['params'][string], label: string): ChoiceScalar {
  if (!isChoiceScalar(value)) {
    throw new Error(`Expected scalar ${label} choice value.`);
  }
  return value;
}

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

function pickOneOption(store: ReturnType<typeof createGameStore>): ChoiceScalar {
  const pending = store.getState().choicePending;
  if (pending === null) {
    throw new Error('Expected pending choice options.');
  }
  return asChoiceScalar(pending.options[0]!.value, 'pending');
}

type Awaitable<T> = T | Promise<T>;

type BridgeOverride<K extends keyof GameWorkerAPI> = (
  ...args: Parameters<GameWorkerAPI[K]>
) => Awaitable<Awaited<ReturnType<GameWorkerAPI[K]>>>;

type BridgeOverrides = {
  [K in keyof GameWorkerAPI]?: BridgeOverride<K>;
};

function createBridgeStub(overrides: BridgeOverrides): GameWorkerAPI {
  const fallbackError = (): Promise<never> => {
    throw new Error('Unexpected bridge call in test stub.');
  };

  const resolveOverride = <K extends keyof GameWorkerAPI>(key: K): GameWorkerAPI[K] => {
    const override = overrides[key];
    if (override === undefined) {
      return fallbackError as GameWorkerAPI[K];
    }
    return (async (...args: Parameters<GameWorkerAPI[K]>) => {
      return await override(...args);
    }) as GameWorkerAPI[K];
  };

  return {
    init: resolveOverride('init'),
    legalMoves: resolveOverride('legalMoves'),
    enumerateLegalMoves: resolveOverride('enumerateLegalMoves'),
    legalChoices: resolveOverride('legalChoices'),
    applyMove: resolveOverride('applyMove'),
    playSequence: resolveOverride('playSequence'),
    terminalResult: resolveOverride('terminalResult'),
    getState: resolveOverride('getState'),
    getMetadata: resolveOverride('getMetadata'),
    getHistoryLength: resolveOverride('getHistoryLength'),
    undo: resolveOverride('undo'),
    reset: resolveOverride('reset'),
    loadFromUrl: resolveOverride('loadFromUrl'),
  };
}

describe('createGameStore', () => {
  it('initGame populates state and enters playing lifecycle', async () => {
    const def = compileStoreFixture(5);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);

    await store.getState().initGame(def, 11, asPlayerId(0));
    const state = store.getState();

    expect(state.gameDef).toEqual(def);
    expect(state.gameState).not.toBeNull();
    expect(state.playerID).toEqual(asPlayerId(0));
    expect(state.legalMoveResult).not.toBeNull();
    expect(state.renderModel).not.toBeNull();
    expect(state.gameLifecycle).toBe('playing');
    expect(state.loading).toBe(false);
  });

  it('initGame with terminal state enters terminal lifecycle', async () => {
    const def = compileStoreFixture(0);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);

    await store.getState().initGame(def, 12, asPlayerId(0));

    expect(store.getState().terminal).not.toBeNull();
    expect(store.getState().gameLifecycle).toBe('terminal');
  });

  it('selectAction initializes progressive choice state from real worker legalChoices', async () => {
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(CHOOSE_ONE_TEST_DEF, 13, asPlayerId(0));

    await store.getState().selectAction(asActionId('pick-one'));
    const state = store.getState();

    expect(state.selectedAction).toEqual(asActionId('pick-one'));
    expect(state.partialMove).toEqual({
      actionId: asActionId('pick-one'),
      params: {},
    });
    expect(state.choiceStack).toEqual([]);
    expect(state.choicePending?.kind).toBe('pending');
    expect(state.choicePending?.type).toBe('chooseOne');
  });

  it('real-worker mixed progressive flow advances through chooseOne -> chooseN and stores decisionId-keyed params', async () => {
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(CHOOSE_MIXED_TEST_DEF, 14, asPlayerId(0));
    await store.getState().selectAction(asActionId('pick-mixed'));

    const firstPending = store.getState().choicePending;
    expect(firstPending?.type).toBe('chooseOne');
    if (firstPending === null) {
      throw new Error('Expected first pending request.');
    }

    const firstChoice = asChoiceScalar(firstPending.options[0]!.value, 'first');
    await store.getState().chooseOne(firstChoice);
    expect(store.getState().choiceStack).toHaveLength(1);
    const secondPending = store.getState().choicePending;
    expect(secondPending?.type).toBe('chooseN');
    if (secondPending === null) {
      throw new Error('Expected second pending request.');
    }
    const secondChoiceValues = secondPending.options
      .slice(0, 2)
      .map((option) => option.value)
      .filter((value): value is string => typeof value === 'string');
    await store.getState().chooseN(secondChoiceValues);

    const state = store.getState();
    expect(state.choicePending).toBeNull();
    expect(state.choiceStack).toHaveLength(2);
    expect(state.partialMove?.params[firstPending.decisionId]).toEqual(firstChoice);
    expect(state.partialMove?.params[secondPending.decisionId]).toEqual(secondChoiceValues);
    expect(state.partialMove?.params[firstPending.name]).toBeUndefined();
    expect(state.partialMove?.params[secondPending.name]).toBeUndefined();
  });

  it('clearing real-worker choicePending clears render-model choice fields', async () => {
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(CHOOSE_ONE_TEST_DEF, 15, asPlayerId(0));
    await store.getState().selectAction(asActionId('pick-one'));

    expect(store.getState().renderModel?.choiceUi.kind).toBe('discreteOne');

    await store.getState().chooseOne(pickOneOption(store));

    const state = store.getState();
    expect(state.choicePending).toBeNull();
    expect(state.renderModel?.choiceUi.kind).toBe('confirmReady');
  });

  it('chooseOne illegal sets error and preserves previous move construction', async () => {
    const def = compileStoreFixture(5);
    const bridge = createBridgeStub({
      init: () => initialState(def, 15, 2),
      enumerateLegalMoves: () => ({
        moves: [{ actionId: asActionId('pick-two'), params: {} }],
        warnings: [],
      }),
      terminalResult: () => null,
      legalChoices: (partialMove) => {
        if (partialMove.params['decision:first'] === undefined) {
          return {
            kind: 'pending',
            complete: false,
            decisionId: 'decision:first',
            name: 'firstZone',
            type: 'chooseOne',
            options: [
              { value: 'table:none', legality: 'legal', illegalReason: null },
              { value: 'reserve:none', legality: 'legal', illegalReason: null },
            ],
            targetKinds: ['zone'],
          };
        }

        return {
          kind: 'illegal',
          complete: false,
          reason: 'pipelineLegalityFailed',
        };
      },
    });
    const store = createGameStore(bridge);
    await store.getState().initGame(def, 15, asPlayerId(0));
    await store.getState().selectAction(asActionId('pick-two'));

    const before = store.getState();
    await store.getState().chooseOne('unknown-zone');
    const after = store.getState();

    expect(after.error).toMatchObject({ code: 'ILLEGAL_MOVE' });
    expect(after.choiceStack).toEqual(before.choiceStack);
    expect(after.partialMove).toEqual(before.partialMove);
    expect(after.choicePending).toEqual(before.choicePending);
  });

  it('pending chooseOne rejects chooseN action before bridge call without mutating move construction state', async () => {
    const bridge = createGameWorker();
    const legalChoicesSpy = vi.spyOn(bridge, 'legalChoices');
    const store = createGameStore(bridge);
    await store.getState().initGame(CHOOSE_ONE_TEST_DEF, 15, asPlayerId(0));
    await store.getState().selectAction(asActionId('pick-one'));

    const callsBefore = legalChoicesSpy.mock.calls.length;
    const before = store.getState();
    await store.getState().chooseN(['a']);
    const after = store.getState();

    expect(legalChoicesSpy).toHaveBeenCalledTimes(callsBefore);
    expect(after.error).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Choice input is incompatible with the current pending choice.',
      details: {
        reason: 'CHOICE_TYPE_MISMATCH',
        expected: 'chooseOne',
        received: 'chooseN',
      },
    });
    expect(after.choiceStack).toEqual(before.choiceStack);
    expect(after.partialMove).toEqual(before.partialMove);
    expect(after.choicePending).toEqual(before.choicePending);
  });

  it('pending chooseN rejects chooseOne action before bridge call without mutating move construction state', async () => {
    const bridge = createGameWorker();
    const legalChoicesSpy = vi.spyOn(bridge, 'legalChoices');
    const store = createGameStore(bridge);
    await store.getState().initGame(CHOOSE_N_TEST_DEF, 15, asPlayerId(0));
    await store.getState().selectAction(asActionId('pick-many'));

    const callsBefore = legalChoicesSpy.mock.calls.length;
    const before = store.getState();
    await store.getState().chooseOne('a');
    const after = store.getState();

    expect(legalChoicesSpy).toHaveBeenCalledTimes(callsBefore);
    expect(after.error).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Choice input is incompatible with the current pending choice.',
      details: {
        reason: 'CHOICE_TYPE_MISMATCH',
        expected: 'chooseN',
        received: 'chooseOne',
      },
    });
    expect(after.choiceStack).toEqual(before.choiceStack);
    expect(after.partialMove).toEqual(before.partialMove);
    expect(after.choicePending).toEqual(before.choicePending);
  });

  it('chooseOne rejects array payload shape with deterministic validation error', async () => {
    const bridge = createGameWorker();
    const legalChoicesSpy = vi.spyOn(bridge, 'legalChoices');
    const store = createGameStore(bridge);
    await store.getState().initGame(CHOOSE_ONE_TEST_DEF, 15, asPlayerId(0));
    await store.getState().selectAction(asActionId('pick-one'));

    const callsBefore = legalChoicesSpy.mock.calls.length;
    const before = store.getState();
    await store.getState().chooseOne(['a'] as unknown as ChoiceScalar);
    const after = store.getState();

    expect(legalChoicesSpy).toHaveBeenCalledTimes(callsBefore);
    expect(after.error).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Choice input is incompatible with the current pending choice.',
      details: {
        reason: 'CHOICE_VALUE_SHAPE_INVALID',
        expected: 'scalar',
        received: 'array',
      },
    });
    expect(after.choiceStack).toEqual(before.choiceStack);
    expect(after.partialMove).toEqual(before.partialMove);
    expect(after.choicePending).toEqual(before.choicePending);
  });

  it('chooseN supports options with min/max metadata through createGameWorker', async () => {
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(CHOOSE_N_TEST_DEF, 15, asPlayerId(0));
    await store.getState().selectAction(asActionId('pick-many'));

    const pending = store.getState().choicePending;
    expect(pending?.type).toBe('chooseN');
    expect(pending?.min).toBe(1);
    expect(pending?.max).toBe(2);
    if (pending === null) {
      throw new Error('Expected chooseN request.');
    }

    const selectedValues = pending.options
      .slice(0, 2)
      .map((option) => option.value)
      .filter((value): value is string => typeof value === 'string');
    expect(selectedValues).toEqual(['a', 'b']);
    await store.getState().chooseN(selectedValues);

    const state = store.getState();
    expect(state.choicePending).toBeNull();
    expect(state.partialMove?.params[pending.decisionId]).toEqual(['a', 'b']);
    expect(state.partialMove?.params[pending.name]).toBeUndefined();
    expect(state.renderModel?.choiceUi.kind).toBe('confirmReady');
  });

  it('real-worker chooseOne stores value under decisionId key (not decision name)', async () => {
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(CHOOSE_ONE_TEST_DEF, 15, asPlayerId(0));
    await store.getState().selectAction(asActionId('pick-one'));

    const pending = store.getState().choicePending;
    expect(pending?.type).toBe('chooseOne');
    if (pending === null) {
      throw new Error('Expected chooseOne request.');
    }
    const choice = asChoiceScalar(pending.options[0]!.value, 'chooseOne');
    await store.getState().chooseOne(choice);

    const state = store.getState();
    expect(state.choicePending).toBeNull();
    expect(state.partialMove?.params[pending.decisionId]).toEqual(choice);
    expect(state.partialMove?.params[pending.name]).toBeUndefined();
  });

  it('confirmMove applies move, refreshes state, and resets move construction', async () => {
    const def = compileStoreFixture(5);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(def, 16, asPlayerId(0));
    await store.getState().selectAction(asActionId('tick'));

    await store.getState().confirmMove();
    const state = store.getState();

    expect(state.gameState?.globalVars.round).toBe(1);
    expect(state.legalMoveResult).not.toBeNull();
    expect(state.renderModel).not.toBeNull();
    expect(state.selectedAction).toBeNull();
    expect(state.partialMove).toBeNull();
    expect(state.choiceStack).toEqual([]);
    expect(state.choicePending).toBeNull();
  });

  it('confirmMove stores effect trace and trigger firings from applyMove', async () => {
    const def = compileStoreFixture(5);
    const baseState = initialState(def, 16, 2);
    const move = { actionId: asActionId('tick'), params: {} };
    const effectTrace: readonly EffectTraceEntry[] = [
      {
        kind: 'varChange',
        scope: 'global',
        varName: 'round',
        oldValue: 0,
        newValue: 1,
        provenance: {
          phase: 'main',
          eventContext: 'actionEffect',
          actionId: 'tick',
          effectPath: 'effects[0]',
        },
      },
    ];
    const triggerFirings: readonly TriggerLogEntry[] = [
      {
        kind: 'fired',
        triggerId: asTriggerId('on-round'),
        event: { type: 'turnStart' },
        depth: 0,
      },
    ];
    const bridge = createBridgeStub({
      init: () => baseState,
      enumerateLegalMoves: () => ({ moves: [move], warnings: [] }),
      legalChoices: () => ({ kind: 'complete', complete: true }),
      applyMove: () => ({
        state: {
          ...baseState,
          globalVars: {
            ...baseState.globalVars,
            round: 1,
          },
        },
        effectTrace,
        triggerFirings,
        warnings: [],
      }),
      terminalResult: () => null,
    });
    const store = createGameStore(bridge);
    await store.getState().initGame(def, 16, asPlayerId(0));
    await store.getState().selectAction(asActionId('tick'));

    await store.getState().confirmMove();

    expect(store.getState().effectTrace).toEqual(effectTrace);
    expect(store.getState().triggerFirings).toEqual(triggerFirings);
  });

  it('confirmMove is a no-op when no partialMove is selected', async () => {
    const def = compileStoreFixture(5);
    const bridge = createGameWorker();
    const applySpy = vi.spyOn(bridge, 'applyMove');
    const store = createGameStore(bridge);
    await store.getState().initGame(def, 17, asPlayerId(0));

    await store.getState().confirmMove();

    expect(applySpy).not.toHaveBeenCalled();
  });

  it('resolveAiTurn advances through non-human turn to the next human turn', async () => {
    const def = compileStoreFixture(8);
    const aiMove: Move = { actionId: asActionId('tick'), params: {} };
    const aiState = {
      ...initialState(def, 27, 2),
      activePlayer: asPlayerId(1),
    };
    const humanState = {
      ...aiState,
      activePlayer: asPlayerId(0),
      globalVars: {
        ...aiState.globalVars,
        round: 1,
      },
    };
    const enumerateLegalMoves = vi
      .fn<GameWorkerAPI['enumerateLegalMoves']>()
      .mockResolvedValueOnce({ moves: [aiMove], warnings: [] })
      .mockResolvedValue({ moves: [aiMove], warnings: [] });
    const applyMove = vi.fn<GameWorkerAPI['applyMove']>(async () => ({
      state: humanState,
      effectTrace: [],
      triggerFirings: [],
      warnings: [],
    }));
    const bridge = createBridgeStub({
      init: () => aiState,
      enumerateLegalMoves,
      terminalResult: () => null,
      applyMove,
    });
    const store = createGameStore(bridge);

    await store.getState().initGame(def, 27, asPlayerId(0));

    const beforeResolve = store.getState();
    expect(beforeResolve.renderModel?.activePlayerID).toEqual(asPlayerId(1));
    expect(beforeResolve.renderModel?.players.find((player) => player.id === asPlayerId(1))?.isHuman).toBe(false);

    await store.getState().resolveAiTurn();

    const afterResolve = store.getState();
    expect(applyMove).toHaveBeenCalledTimes(1);
    expect(afterResolve.gameState?.globalVars.round).toBe(1);
    expect(afterResolve.renderModel?.activePlayerID).toEqual(asPlayerId(0));
    expect(afterResolve.renderModel?.players.find((player) => player.id === asPlayerId(0))?.isHuman).toBe(true);
    expect(afterResolve.error).toBeNull();
  });

  it('resolveAiTurn no-ops on a human turn', async () => {
    const def = compileStoreFixture(8);
    const bridge = createGameWorker();
    const applySpy = vi.spyOn(bridge, 'applyMove');
    const store = createGameStore(bridge);

    await store.getState().initGame(def, 28, asPlayerId(0));
    expect(store.getState().renderModel?.activePlayerID).toEqual(asPlayerId(0));

    await store.getState().resolveAiTurn();

    expect(applySpy).not.toHaveBeenCalled();
    expect(store.getState().error).toBeNull();
  });

  it('resolveAiTurn no-ops safely when no session is initialized', async () => {
    const bridge = createBridgeStub({});
    const store = createGameStore(bridge);

    await store.getState().resolveAiTurn();

    expect(store.getState().loading).toBe(false);
    expect(store.getState().error).toBeNull();
    expect(store.getState().renderModel).toBeNull();
  });

  it('resolveAiTurn uses seat policy to select AI move', async () => {
    const def = compileStoreFixture(8);
    const aiState = {
      ...initialState(def, 31, 2),
      activePlayer: asPlayerId(1),
    };
    const moveA: Move = { actionId: asActionId('tick'), params: { pick: 'a' } };
    const moveB: Move = { actionId: asActionId('tick'), params: { pick: 'b' } };
    const applyMove = vi.fn<GameWorkerAPI['applyMove']>(async () => ({
      state: {
        ...aiState,
        activePlayer: asPlayerId(0),
      },
      effectTrace: [],
      triggerFirings: [],
      warnings: [],
    }));
    const bridge = createBridgeStub({
      init: () => aiState,
      enumerateLegalMoves: () => ({ moves: [moveA, moveB], warnings: [] }),
      terminalResult: () => null,
      applyMove,
    });
    const store = createGameStore(bridge);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);

    try {
      await store.getState().initGame(def, 31, asPlayerId(0));
      await store.getState().resolveAiTurn();
    } finally {
      randomSpy.mockRestore();
    }

    expect(applyMove).toHaveBeenCalledTimes(1);
    expect(applyMove.mock.calls[0]?.[0]).toEqual(moveB);
  });

  it('resolveAiTurn preserves state when AI turn has no legal moves', async () => {
    const def = compileStoreFixture(8);
    const aiState = {
      ...initialState(def, 29, 2),
      activePlayer: asPlayerId(1),
    };
    const applyMove = vi.fn<GameWorkerAPI['applyMove']>(async () => {
      throw new Error('applyMove should not be called when there are no legal moves');
    });
    const bridge = createBridgeStub({
      init: () => aiState,
      enumerateLegalMoves: () => ({ moves: [], warnings: [] }),
      terminalResult: () => null,
      applyMove,
    });
    const store = createGameStore(bridge);

    await store.getState().initGame(def, 29, asPlayerId(0));
    await store.getState().resolveAiTurn();

    expect(applyMove).not.toHaveBeenCalled();
    expect(store.getState().gameState).toEqual(aiState);
    expect(store.getState().renderModel?.activePlayerID).toEqual(asPlayerId(1));
    expect(store.getState().error).toBeNull();
  });

  it('real-worker cancelChoice pops one choice and re-queries pending decision', async () => {
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(CHOOSE_MIXED_TEST_DEF, 18, asPlayerId(0));
    await store.getState().selectAction(asActionId('pick-mixed'));
    const firstChoice = pickOneOption(store);
    await store.getState().chooseOne(firstChoice);
    const secondPending = store.getState().choicePending;
    if (secondPending === null) {
      throw new Error('Expected second pending request.');
    }
    const selected = secondPending.options
      .slice(0, 2)
      .map((option) => option.value)
      .filter((value): value is string => typeof value === 'string');
    await store.getState().chooseN(selected);
    expect(store.getState().choicePending).toBeNull();

    await store.getState().cancelChoice();

    expect(store.getState().choiceStack).toHaveLength(1);
    expect(store.getState().choicePending?.kind).toBe('pending');
    expect(store.getState().choicePending?.decisionId).toBe(secondPending.decisionId);
    expect(store.getState().choicePending?.type).toBe('chooseN');
  });

  it('real-worker cancelMove clears selected action and progressive choice state', async () => {
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(CHOOSE_MIXED_TEST_DEF, 18, asPlayerId(0));
    await store.getState().selectAction(asActionId('pick-mixed'));
    await store.getState().chooseOne(pickOneOption(store));

    store.getState().cancelMove();

    expect(store.getState().selectedAction).toBeNull();
    expect(store.getState().partialMove).toBeNull();
    expect(store.getState().choiceStack).toEqual([]);
    expect(store.getState().choicePending).toBeNull();
  });

  it('cancelChoice with empty stack is a no-op', async () => {
    const def = compileStoreFixture(5);
    const bridge = createGameWorker();
    const legalChoicesSpy = vi.spyOn(bridge, 'legalChoices');
    const store = createGameStore(bridge);
    await store.getState().initGame(def, 19, asPlayerId(0));
    await store.getState().selectAction(asActionId('tick'));
    const callsBefore = legalChoicesSpy.mock.calls.length;

    await store.getState().cancelChoice();

    expect(legalChoicesSpy).toHaveBeenCalledTimes(callsBefore);
    expect(store.getState().choiceStack).toEqual([]);
  });

  it('undo restores previous state and transitions terminal -> playing', async () => {
    const def = compileStoreFixture(1);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(def, 20, asPlayerId(0));
    await store.getState().selectAction(asActionId('tick'));
    await store.getState().confirmMove();
    expect(store.getState().gameLifecycle).toBe('terminal');

    await store.getState().undo();

    expect(store.getState().gameLifecycle).toBe('playing');
    expect(store.getState().gameState?.globalVars.round).toBe(0);
    expect(store.getState().legalMoveResult).not.toBeNull();
  });

  it('undo re-enumerates legal moves, re-checks terminal result, and re-derives render model', async () => {
    const def = compileStoreFixture(1);
    const bridge = createGameWorker();
    const enumerateSpy = vi.spyOn(bridge, 'enumerateLegalMoves');
    const terminalSpy = vi.spyOn(bridge, 'terminalResult');
    const store = createGameStore(bridge);
    await store.getState().initGame(def, 20, asPlayerId(0));
    await store.getState().selectAction(asActionId('tick'));
    await store.getState().confirmMove();
    expect(store.getState().renderModel?.terminal).not.toBeNull();

    const enumerateCallsBeforeUndo = enumerateSpy.mock.calls.length;
    const terminalCallsBeforeUndo = terminalSpy.mock.calls.length;
    await store.getState().undo();

    expect(enumerateSpy.mock.calls.length).toBe(enumerateCallsBeforeUndo + 1);
    expect(terminalSpy.mock.calls.length).toBe(terminalCallsBeforeUndo + 1);
    expect(store.getState().terminal).toBeNull();
    expect(store.getState().renderModel?.terminal).toBeNull();
  });

  it('omitted derivation fields remain stable on unrelated updates', async () => {
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(CHOOSE_ONE_TEST_DEF, 20, asPlayerId(0));
    await store.getState().selectAction(asActionId('pick-one'));

    const before = store.getState();
    store.getState().setAnimationPlaying(true);
    const after = store.getState();

    expect(after.gameDef).toEqual(before.gameDef);
    expect(after.gameState).toEqual(before.gameState);
    expect(after.playerID).toEqual(before.playerID);
    expect(after.legalMoveResult).toEqual(before.legalMoveResult);
    expect(after.choicePending).toEqual(before.choicePending);
    expect(after.selectedAction).toEqual(before.selectedAction);
    expect(after.choiceStack).toEqual(before.choiceStack);
    expect(after.playerSeats).toBe(before.playerSeats);
    expect(after.terminal).toEqual(before.terminal);
    expect(after.renderModel).toBe(before.renderModel);
  });

  it('undo with no history is a no-op', async () => {
    const def = compileStoreFixture(5);
    const bridge = createGameWorker();
    const store = createGameStore(bridge);
    await store.getState().initGame(def, 21, asPlayerId(0));
    const before = store.getState().gameState;

    await store.getState().undo();

    expect(store.getState().gameState).toEqual(before);
  });

  it('loading brackets bridge calls during initGame', async () => {
    const def = compileStoreFixture(5);
    const bridge = createGameWorker();
    const baseState = initialState(def, 22, 2);
    const originalEnumerate = bridge.enumerateLegalMoves.bind(bridge);
    const initSpy = vi.spyOn(bridge, 'init').mockImplementation(async () => baseState);
    const enumerateSpy = vi.spyOn(bridge, 'enumerateLegalMoves');
    let store!: ReturnType<typeof createGameStore>;

    enumerateSpy.mockImplementation((options) => {
      expect(store.getState().loading).toBe(true);
      return originalEnumerate(options);
    });

    store = createGameStore(bridge);
    await store.getState().initGame(def, 22, asPlayerId(0));

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(enumerateSpy).toHaveBeenCalledTimes(1);
    expect(store.getState().loading).toBe(false);
  });

  it('lifecycle transitions through initializing before reaching terminal', async () => {
    const def = compileStoreFixture(0);
    const baseState = initialState(def, 22, 2);
    let sawInitializing = false;
    let store!: ReturnType<typeof createGameStore>;
    const bridge = createBridgeStub({
      init: () => {
        sawInitializing = store.getState().gameLifecycle === 'initializing';
        return baseState;
      },
      enumerateLegalMoves: () => ({ moves: [], warnings: [] }),
      terminalResult: () => ({ type: 'draw' }),
    });

    store = createGameStore(bridge);
    expect(store.getState().gameLifecycle).toBe('idle');
    await store.getState().initGame(def, 22, asPlayerId(0));

    expect(sawInitializing).toBe(true);
    expect(store.getState().gameLifecycle).toBe('terminal');
  });

  it('failed initGame after prior successful game clears stale session snapshot', async () => {
    const def = compileStoreFixture(5);
    const workerError: WorkerError = {
      code: 'VALIDATION_FAILED',
      message: 'bad game definition',
    };
    const gameState = initialState(def, 24, 2);
    const initMock = vi
      .fn<GameWorkerAPI['init']>()
      .mockResolvedValueOnce(gameState)
      .mockImplementationOnce(() => {
        throw workerError;
      });
    const bridge = createBridgeStub({
      init: initMock,
      enumerateLegalMoves: () => ({ moves: [{ actionId: asActionId('tick'), params: {} }], warnings: [] }),
      terminalResult: () => null,
      legalChoices: () => ({ kind: 'complete', complete: true }),
    });
    const store = createGameStore(bridge);

    await store.getState().initGame(def, 24, asPlayerId(0));
    await store.getState().selectAction(asActionId('tick'));
    expect(store.getState().renderModel).not.toBeNull();
    expect(store.getState().selectedAction).toEqual(asActionId('tick'));

    await store.getState().initGame(def, 24, asPlayerId(0));

    const state = store.getState();
    expect(state.gameLifecycle).toBe('idle');
    expect(state.loading).toBe(false);
    expect(state.gameDef).toBeNull();
    expect(state.gameState).toBeNull();
    expect(state.playerID).toBeNull();
    expect(state.legalMoveResult).toBeNull();
    expect(state.choicePending).toBeNull();
    expect(state.selectedAction).toBeNull();
    expect(state.partialMove).toBeNull();
    expect(state.choiceStack).toEqual([]);
    expect(state.effectTrace).toEqual([]);
    expect(state.triggerFirings).toEqual([]);
    expect(state.terminal).toBeNull();
    expect(state.playerSeats.size).toBe(0);
    expect(state.renderModel).toBeNull();
  });

  it('failed initGame keeps structured WorkerError while clearing render/session fields', async () => {
    const def = compileStoreFixture(5);
    const workerError: WorkerError = {
      code: 'VALIDATION_FAILED',
      message: 'bad game definition',
      details: { source: 'test' },
    };
    const gameState = initialState(def, 25, 2);
    const initMock = vi
      .fn<GameWorkerAPI['init']>()
      .mockResolvedValueOnce(gameState)
      .mockImplementationOnce(() => {
        throw workerError;
      });
    const bridge = createBridgeStub({
      init: initMock,
      enumerateLegalMoves: () => ({ moves: [{ actionId: asActionId('tick'), params: {} }], warnings: [] }),
      terminalResult: () => null,
    });
    const store = createGameStore(bridge);

    await store.getState().initGame(def, 25, asPlayerId(0));
    expect(store.getState().renderModel).not.toBeNull();

    await store.getState().initGame(def, 25, asPlayerId(0));

    const state = store.getState();
    expect(state.error).toEqual(workerError);
    expect(state.renderModel).toBeNull();
    expect(state.gameDef).toBeNull();
    expect(state.gameState).toBeNull();
    expect(state.playerID).toBeNull();
    expect(state.legalMoveResult).toBeNull();
    expect(state.terminal).toBeNull();
    expect(state.playerSeats.size).toBe(0);
  });

  it('retry initGame after failure succeeds and rebuilds render model', async () => {
    const def = compileStoreFixture(5);
    const gameState = initialState(def, 26, 2);
    const initMock = vi
      .fn<GameWorkerAPI['init']>()
      .mockImplementationOnce(() => {
        throw new Error('boom');
      })
      .mockResolvedValueOnce(gameState);
    const bridge = createBridgeStub({
      init: initMock,
      enumerateLegalMoves: () => ({ moves: [{ actionId: asActionId('tick'), params: {} }], warnings: [] }),
      terminalResult: () => null,
    });
    const store = createGameStore(bridge);

    await store.getState().initGame(def, 26, asPlayerId(0));
    expect(store.getState().gameLifecycle).toBe('idle');
    expect(store.getState().renderModel).toBeNull();
    expect(store.getState().error).toMatchObject({ code: 'INTERNAL_ERROR' });

    await store.getState().initGame(def, 26, asPlayerId(0));

    const state = store.getState();
    expect(state.gameLifecycle).toBe('playing');
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.gameDef).toEqual(def);
    expect(state.gameState).not.toBeNull();
    expect(state.playerID).toEqual(asPlayerId(0));
    expect(state.legalMoveResult).not.toBeNull();
    expect(state.renderModel).not.toBeNull();
  });

  it('bridge errors are captured as WorkerError and clearError resets them', async () => {
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
    await store.getState().initGame(def, 23, asPlayerId(0));

    expect(store.getState().error).toEqual(workerError);
    expect(store.getState().loading).toBe(false);
    store.getState().clearError();
    expect(store.getState().error).toBeNull();
  });

  it('non-init bridge errors preserve current lifecycle while setting structured error', async () => {
    const def = compileStoreFixture(5);
    const workerError: WorkerError = {
      code: 'INTERNAL_ERROR',
      message: 'legalChoices exploded',
    };
    const bridge = createBridgeStub({
      init: () => initialState(def, 23, 2),
      enumerateLegalMoves: () => ({ moves: [{ actionId: asActionId('tick'), params: {} }], warnings: [] }),
      terminalResult: () => null,
      legalChoices: () => {
        throw workerError;
      },
    });
    const store = createGameStore(bridge);

    await store.getState().initGame(def, 23, asPlayerId(0));
    expect(store.getState().gameLifecycle).toBe('playing');

    await store.getState().selectAction(asActionId('tick'));

    expect(store.getState().gameLifecycle).toBe('playing');
    expect(store.getState().error).toEqual(workerError);
    expect(store.getState().loading).toBe(false);
  });

  it('setAnimationPlaying toggles animation flag', async () => {
    const store = createGameStore(createGameWorker());
    expect(store.getState().animationPlaying).toBe(false);

    store.getState().setAnimationPlaying(true);
    expect(store.getState().animationPlaying).toBe(true);

    store.getState().setAnimationPlaying(false);
    expect(store.getState().animationPlaying).toBe(false);
  });
});
