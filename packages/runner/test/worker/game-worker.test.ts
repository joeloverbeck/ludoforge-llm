import { afterEach, describe, expect, it, vi } from 'vitest';
import { asActionId } from '@ludoforge/engine/runtime';

import { createGameWorker, type OperationStamp, type WorkerError } from '../../src/worker/game-worker-api.js';
import { CHOOSE_MIXED_TEST_DEF, CHOOSE_N_TEST_DEF, LEGAL_TICK_MOVE, TEST_DEF } from './test-fixtures.js';

const expectWorkerError = (error: unknown, code: WorkerError['code']): WorkerError => {
  expect(error).toMatchObject({ code });
  expect(typeof (error as { readonly message?: unknown }).message).toBe('string');
  return error as WorkerError;
};

const createStampFactory = (): (() => OperationStamp) => {
  let token = 0;
  return () => ({ epoch: 0, token: ++token });
};

describe('createGameWorker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('throws NOT_INITIALIZED for methods that require init', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();

    const operations = [
      () => worker.publishMicroturn(),
      () => worker.applyDecision({ kind: 'actionSelection', actionId: asActionId('tick') }, undefined, nextStamp()),
      () => worker.advanceAutoresolvable(undefined, nextStamp()),
      () => worker.applyReplayMove(LEGAL_TICK_MOVE, undefined, nextStamp()),
      () => worker.playSequence([LEGAL_TICK_MOVE], undefined, nextStamp(), undefined),
      () => worker.describeAction('tick'),
      () => worker.terminalResult(),
      () => worker.getState(),
      () => worker.getMetadata(),
      () => worker.rewindToTurnBoundary(0 as never, nextStamp()),
      () => worker.reset(undefined, undefined, undefined, nextStamp()),
    ];

    for (const operation of operations) {
      try {
        await operation();
        throw new Error('Expected operation to throw');
      } catch (error) {
        expectWorkerError(error, 'NOT_INITIALIZED');
      }
    }
  });

  it('publishes an actionSelection microturn after init', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 7, undefined, nextStamp());

    const microturn = await worker.publishMicroturn();
    expect(microturn.kind).toBe('actionSelection');
    expect(microturn.legalActions).toEqual([
      expect.objectContaining({
        kind: 'actionSelection',
        actionId: asActionId('tick'),
        move: LEGAL_TICK_MOVE,
      }),
    ]);
  });

  it('applies a decision and advances state with default trace enabled', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 7, undefined, nextStamp());

    const microturn = await worker.publishMicroturn();
    const decision = microturn.legalActions[0]!;
    const result = await worker.applyDecision(decision, undefined, nextStamp());

    expect(result.state.globalVars.tick).toBe(1);
    expect(result.effectTrace).toBeDefined();
    expect(await worker.getState()).toEqual(result.state);
  });

  it('supports per-call trace override for decision and replay helpers', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 9, { enableTrace: false }, nextStamp());

    const microturn = await worker.publishMicroturn();
    const noTraceDecision = await worker.applyDecision(microturn.legalActions[0]!, undefined, nextStamp());
    expect(noTraceDecision.effectTrace).toBeUndefined();

    await worker.reset(undefined, 9, { enableTrace: false }, nextStamp());
    const replay = await worker.applyReplayMove(LEGAL_TICK_MOVE, { trace: true }, nextStamp());
    expect(replay.effectTrace).toBeDefined();
  });

  it('supports sequential chooseOne -> chooseN decision application', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(CHOOSE_MIXED_TEST_DEF, 11, undefined, nextStamp());

    const actionSelection = await worker.publishMicroturn();
    await worker.applyDecision(actionSelection.legalActions[0]!, undefined, nextStamp());

    const chooseOne = await worker.publishMicroturn();
    expect(chooseOne.kind).toBe('chooseOne');
    await worker.applyDecision(chooseOne.legalActions[0]!, undefined, nextStamp());

    const chooseN = await worker.publishMicroturn();
    expect(chooseN.kind).toBe('chooseNStep');
    const addDecision = chooseN.legalActions.find((decision) => decision.kind === 'chooseNStep' && decision.command === 'add');
    expect(addDecision).toBeDefined();
    await worker.applyDecision(addDecision!, undefined, nextStamp());

    const chooseNConfirm = await worker.publishMicroturn();
    const confirmDecision = chooseNConfirm.legalActions.find((decision) => decision.kind === 'chooseNStep' && decision.command === 'confirm');
    expect(confirmDecision).toBeDefined();
    const result = await worker.applyDecision(confirmDecision!, undefined, nextStamp());
    expect(result.log.turnRetired).toBe(true);
  });

  it('replays move history through compatibility helpers', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 21, undefined, nextStamp());

    const replayResult = await worker.applyReplayMove(LEGAL_TICK_MOVE, undefined, nextStamp());
    expect(replayResult.state.globalVars.tick).toBe(1);

    await worker.reset(undefined, 21, undefined, nextStamp());
    const sequence = await worker.playSequence([LEGAL_TICK_MOVE, LEGAL_TICK_MOVE], undefined, nextStamp());
    expect(sequence).toHaveLength(2);
    expect((await worker.getState()).globalVars.tick).toBe(2);
  });

  it('rewinds to a turn boundary and enforces stale mutation rejection', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(CHOOSE_N_TEST_DEF, 31, undefined, nextStamp());

    const initialMicroturn = await worker.publishMicroturn();
    const turnId = initialMicroturn.turnId;
    await worker.applyDecision(initialMicroturn.legalActions[0]!, undefined, nextStamp());
    const chooseN = await worker.publishMicroturn();
    const addDecision = chooseN.legalActions.find(
      (decision) => decision.kind === 'chooseNStep' && decision.command === 'add' && decision.value === 'a',
    );
    expect(addDecision).toBeDefined();
    await worker.applyDecision(addDecision!, undefined, nextStamp());

    const rewound = await worker.rewindToTurnBoundary(turnId, nextStamp());
    expect(rewound).not.toBeNull();
    const rewoundMicroturn = await worker.publishMicroturn();
    expect(rewoundMicroturn.kind).toBe('actionSelection');

    const staleStamp = { epoch: 0, token: 1 };
    await expect(worker.advanceAutoresolvable(undefined, staleStamp)).rejects.toMatchObject({
      code: 'STALE_OPERATION',
    });
  });

  it('loads and initializes a GameDef from URL', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => TEST_DEF,
    })));

    const initResult = await worker.loadFromUrl('https://example.test/game.json', 55, undefined, nextStamp());
    expect(initResult.state.globalVars.tick).toBe(0);
    expect((await worker.publishMicroturn()).kind).toBe('actionSelection');
  });
});
