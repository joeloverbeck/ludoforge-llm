import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGameWorker, type OperationStamp, type WorkerError } from '../../src/worker/game-worker-api';
import { ALT_TEST_DEF, CHOOSE_ONE_TEST_DEF, ILLEGAL_MOVE, LEGAL_TICK_MOVE, RANGE_TEST_DEF, TEST_DEF } from './test-fixtures';
import { asActionId, type Move } from '@ludoforge/engine/runtime';

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
      () => worker.legalMoves(),
      () => worker.enumerateLegalMoves(),
      () => worker.legalChoices(LEGAL_TICK_MOVE),
      () => worker.applyMove(LEGAL_TICK_MOVE, undefined, nextStamp()),
      () => worker.playSequence([LEGAL_TICK_MOVE], nextStamp(), undefined),
      () => worker.terminalResult(),
      () => worker.getState(),
      () => worker.getMetadata(),
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

  it('enables trace by default and allows per-call override', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 7, undefined, nextStamp());

    const traced = await worker.applyMove(LEGAL_TICK_MOVE, undefined, nextStamp());
    expect(traced.effectTrace).toBeDefined();

    const noTrace = await worker.applyMove(LEGAL_TICK_MOVE, { trace: false }, nextStamp());
    expect(noTrace.effectTrace).toBeUndefined();
  });

  it('supports explicit playerCount on init', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    const state = await worker.init(ALT_TEST_DEF, 8, { playerCount: 3 }, nextStamp());
    expect(state.playerCount).toBe(3);
  });

  it('respects init-level trace config', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 9, { enableTrace: false }, nextStamp());

    const result = await worker.applyMove(LEGAL_TICK_MOVE, undefined, nextStamp());
    expect(result.effectTrace).toBeUndefined();
  });

  it('returns legal move surfaces with expected shape and deterministic budget truncation', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 10, undefined, nextStamp());

    const legal = await worker.legalMoves();
    expect(legal.length).toBeGreaterThan(0);

    const enumerated = await worker.enumerateLegalMoves();
    expect(enumerated.moves.length).toBeGreaterThan(0);
    expect(Array.isArray(enumerated.warnings)).toBe(true);

    const truncated = await worker.enumerateLegalMoves({
      budgets: { maxTemplates: 0 },
    });
    expect(truncated.moves).toEqual([]);
    expect(truncated.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED' }),
      ]),
    );
  });

  it('returns applyMove result shape and updates state progression across sequential moves', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 11, undefined, nextStamp());

    const first = await worker.applyMove(LEGAL_TICK_MOVE, { trace: true }, nextStamp());
    expect(first).toEqual(
      expect.objectContaining({
        state: expect.any(Object),
        triggerFirings: expect.any(Array),
        warnings: expect.any(Array),
      }),
    );
    expect(first.effectTrace).toBeDefined();
    expect(first.state.globalVars.tick).toBe(1);

    const second = await worker.applyMove(LEGAL_TICK_MOVE, { trace: false }, nextStamp());
    expect(second.effectTrace).toBeUndefined();
    expect(second.state.globalVars.tick).toBe(2);
    expect(await worker.getState()).toEqual(second.state);
  });

  it('returns a complete choice request variant for a fully specified move', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 12, undefined, nextStamp());
    const request = await worker.legalChoices(LEGAL_TICK_MOVE);
    expect(request.kind).toBe('complete');
    expect(request.complete).toBe(true);
  });

  it('always evaluates choice option legality in worker legalChoices path', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(CHOOSE_ONE_TEST_DEF, 121, undefined, nextStamp());
    const pendingMove: Move = {
      actionId: asActionId('pick-one'),
      params: {},
    };

    const request = await worker.legalChoices(pendingMove);
    expect(request.kind).toBe('pending');
    if (request.kind !== 'pending') {
      throw new Error('Expected pending choice request.');
    }
    expect(request.options.map((entry) => entry.legality)).toEqual(['legal', 'legal', 'legal']);
  });

  it('rolls back history when applyMove fails', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    const initial = await worker.init(TEST_DEF, 13, undefined, nextStamp());

    expect(await worker.getHistoryLength()).toBe(0);

    try {
      await worker.applyMove(ILLEGAL_MOVE, undefined, nextStamp());
      throw new Error('Expected applyMove to throw');
    } catch (error) {
      expectWorkerError(error, 'ILLEGAL_MOVE');
    }

    expect(await worker.getHistoryLength()).toBe(0);
    expect(await worker.getState()).toEqual(initial);
  });

  it('returns one playSequence result per move and invokes callbacks in order', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 14, undefined, nextStamp());

    const callbackIndices: number[] = [];
    const results = await worker.playSequence(
      [LEGAL_TICK_MOVE, LEGAL_TICK_MOVE],
      nextStamp(),
      (_result, index) => {
        callbackIndices.push(index);
      },
    );

    expect(results).toHaveLength(2);
    expect(callbackIndices).toEqual([0, 1]);
    expect(await worker.getHistoryLength()).toBe(2);
    expect((await worker.getState()).globalVars.tick).toBe(2);
  });

  it('applies successful playSequence steps and keeps history consistent on failure', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 15, undefined, nextStamp());

    const callbackIndices: number[] = [];

    try {
      await worker.playSequence(
        [LEGAL_TICK_MOVE, ILLEGAL_MOVE],
        nextStamp(),
        (_result, index) => {
          callbackIndices.push(index);
        },
      );
      throw new Error('Expected playSequence to throw');
    } catch (error) {
      expectWorkerError(error, 'ILLEGAL_MOVE');
    }

    expect(callbackIndices).toEqual([0]);
    expect(await worker.getHistoryLength()).toBe(1);
    expect((await worker.getState()).globalVars.tick).toBe(1);
  });

  it('executes playSequence with 10+ moves and reports each step', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 50, undefined, nextStamp());

    const moves = Array.from({ length: 15 }, () => LEGAL_TICK_MOVE);
    const callbackIndices: number[] = [];

    const results = await worker.playSequence(
      moves,
      nextStamp(),
      (_result, index) => {
        callbackIndices.push(index);
      },
    );

    expect(results).toHaveLength(15);
    expect(callbackIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect((await worker.getState()).globalVars.tick).toBe(15);
    expect(await worker.getHistoryLength()).toBe(15);

    for (const result of results) {
      expect(result).toEqual(
        expect.objectContaining({
          state: expect.any(Object),
          triggerFirings: expect.any(Array),
          warnings: expect.any(Array),
        }),
      );
    }
  });

  it('returns null terminal result for non-terminal state', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 16, undefined, nextStamp());
    expect(await worker.terminalResult()).toBeNull();
  });

  it('supports metadata, undo, and reset lifecycle', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    const initial = await worker.init(TEST_DEF, 17, undefined, nextStamp());

    const metadata = await worker.getMetadata();
    expect(metadata).toEqual({
      gameId: 'runner-worker-test',
      playerCount: 2,
      phaseNames: ['main'],
      actionNames: ['tick'],
      zoneNames: ['table:none'],
    });

    await worker.applyMove(LEGAL_TICK_MOVE, undefined, nextStamp());
    expect(await worker.getHistoryLength()).toBe(1);
    expect((await worker.getState()).globalVars.tick).toBe(1);

    const undone = await worker.undo(nextStamp());
    expect(undone).toEqual(initial);
    expect(await worker.getHistoryLength()).toBe(0);

    await worker.applyMove(LEGAL_TICK_MOVE, undefined, nextStamp());
    expect(await worker.getHistoryLength()).toBe(1);

    const reset = await worker.reset(undefined, undefined, undefined, nextStamp());
    expect(reset.globalVars.tick).toBe(0);
    expect(await worker.getHistoryLength()).toBe(0);
  });

  it('returns null when undo is called on initial state', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 18, undefined, nextStamp());
    expect(await worker.undo(nextStamp())).toBeNull();
  });

  it('supports reset with new seed, new def, and new playerCount', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    const initial = await worker.init(RANGE_TEST_DEF, 19, { playerCount: 2 }, nextStamp());

    const reseeded = await worker.reset(undefined, 20, undefined, nextStamp());
    expect(reseeded.rng.state).not.toEqual(initial.rng.state);
    expect(await worker.getHistoryLength()).toBe(0);

    const resetWithNewDef = await worker.reset(ALT_TEST_DEF, 21, { playerCount: 3 }, nextStamp());
    expect(resetWithNewDef.playerCount).toBe(3);
    expect(await worker.getMetadata()).toEqual({
      gameId: 'runner-worker-test-alt',
      playerCount: 3,
      phaseNames: ['main'],
      actionNames: ['tick-alt'],
      zoneNames: ['table:none'],
    });

    const resetWithNewPlayerCount = await worker.reset(RANGE_TEST_DEF, 22, { playerCount: 4 }, nextStamp());
    expect(resetWithNewPlayerCount.playerCount).toBe(4);
  });

  it('loads and initializes a GameDef from URL', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(TEST_DEF), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const state = await worker.loadFromUrl('https://example.com/game-def.json', 23, {
      playerCount: 2,
      enableTrace: false,
    }, nextStamp());

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/game-def.json');
    expect(state.playerCount).toBe(2);
    expect(await worker.getHistoryLength()).toBe(0);

    const applyResult = await worker.applyMove(LEGAL_TICK_MOVE, undefined, nextStamp());
    expect(applyResult.effectTrace).toBeUndefined();
  });

  it('throws VALIDATION_FAILED when URL fetch fails with non-OK status', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404, statusText: 'Not Found' })));

    await expect(worker.loadFromUrl('https://example.com/missing.json', 5, undefined, nextStamp())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Failed to fetch GameDef: 404 Not Found',
    });
  });

  it('throws VALIDATION_FAILED when URL payload is invalid JSON', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{invalid-json', { status: 200 })));

    await expect(worker.loadFromUrl('https://example.com/bad-json.json', 5, undefined, nextStamp())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('throws VALIDATION_FAILED when URL payload is not a valid GameDef', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ invalid: true }), { status: 200 })));

    try {
      await worker.loadFromUrl('https://example.com/invalid-def.json', 5, undefined, nextStamp());
      throw new Error('Expected loadFromUrl to throw');
    } catch (error) {
      const workerError = expectWorkerError(error, 'VALIDATION_FAILED');
      expect(workerError.message).toContain('Invalid GameDef input from URL https://example.com/invalid-def.json');
      expect(workerError.details).toMatchObject({
        source: 'URL https://example.com/invalid-def.json',
        receivedType: 'object',
      });
    }
  });
});
