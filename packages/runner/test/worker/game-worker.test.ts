import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGameWorker, type WorkerError } from '../../src/worker/game-worker-api';
import { ALT_TEST_DEF, ILLEGAL_MOVE, LEGAL_TICK_MOVE, RANGE_TEST_DEF, TEST_DEF } from './test-fixtures';

const expectWorkerError = (error: unknown, code: WorkerError['code']): WorkerError => {
  expect(error).toMatchObject({ code });
  expect(typeof (error as { readonly message?: unknown }).message).toBe('string');
  return error as WorkerError;
};

describe('createGameWorker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('throws NOT_INITIALIZED for methods that require init', () => {
    const worker = createGameWorker();

    const operations = [
      () => worker.legalMoves(),
      () => worker.enumerateLegalMoves(),
      () => worker.legalChoices(LEGAL_TICK_MOVE),
      () => worker.applyMove(LEGAL_TICK_MOVE),
      () => worker.playSequence([LEGAL_TICK_MOVE]),
      () => worker.terminalResult(),
      () => worker.getState(),
      () => worker.getMetadata(),
      () => worker.reset(),
    ];

    for (const operation of operations) {
      try {
        operation();
        throw new Error('Expected operation to throw');
      } catch (error) {
        expectWorkerError(error, 'NOT_INITIALIZED');
      }
    }
  });

  it('enables trace by default and allows per-call override', () => {
    const worker = createGameWorker();
    worker.init(TEST_DEF, 7);

    const traced = worker.applyMove(LEGAL_TICK_MOVE);
    expect(traced.effectTrace).toBeDefined();

    const noTrace = worker.applyMove(LEGAL_TICK_MOVE, { trace: false });
    expect(noTrace.effectTrace).toBeUndefined();
  });

  it('supports explicit playerCount on init', () => {
    const worker = createGameWorker();
    const state = worker.init(ALT_TEST_DEF, 8, { playerCount: 3 });
    expect(state.playerCount).toBe(3);
  });

  it('respects init-level trace config', () => {
    const worker = createGameWorker();
    worker.init(TEST_DEF, 9, { enableTrace: false });

    const result = worker.applyMove(LEGAL_TICK_MOVE);
    expect(result.effectTrace).toBeUndefined();
  });

  it('returns legal move surfaces with expected shape and deterministic budget truncation', () => {
    const worker = createGameWorker();
    worker.init(TEST_DEF, 10);

    const legal = worker.legalMoves();
    expect(legal.length).toBeGreaterThan(0);

    const enumerated = worker.enumerateLegalMoves();
    expect(enumerated.moves.length).toBeGreaterThan(0);
    expect(Array.isArray(enumerated.warnings)).toBe(true);

    const truncated = worker.enumerateLegalMoves({
      budgets: { maxTemplates: 0 },
    });
    expect(truncated.moves).toEqual([]);
    expect(truncated.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED' }),
      ]),
    );
  });

  it('returns applyMove result shape and updates state progression across sequential moves', () => {
    const worker = createGameWorker();
    worker.init(TEST_DEF, 11);

    const first = worker.applyMove(LEGAL_TICK_MOVE, { trace: true });
    expect(first).toEqual(
      expect.objectContaining({
        state: expect.any(Object),
        triggerFirings: expect.any(Array),
        warnings: expect.any(Array),
      }),
    );
    expect(first.effectTrace).toBeDefined();
    expect(first.state.globalVars.tick).toBe(1);

    const second = worker.applyMove(LEGAL_TICK_MOVE, { trace: false });
    expect(second.effectTrace).toBeUndefined();
    expect(second.state.globalVars.tick).toBe(2);
    expect(worker.getState()).toEqual(second.state);
  });

  it('returns a complete choice request variant for a fully specified move', () => {
    const worker = createGameWorker();
    worker.init(TEST_DEF, 12);
    const request = worker.legalChoices(LEGAL_TICK_MOVE);
    expect(request.kind).toBe('complete');
    expect(request.complete).toBe(true);
  });

  it('rolls back history when applyMove fails', () => {
    const worker = createGameWorker();
    const initial = worker.init(TEST_DEF, 13);

    expect(worker.getHistoryLength()).toBe(0);

    try {
      worker.applyMove(ILLEGAL_MOVE);
      throw new Error('Expected applyMove to throw');
    } catch (error) {
      expectWorkerError(error, 'ILLEGAL_MOVE');
    }

    expect(worker.getHistoryLength()).toBe(0);
    expect(worker.getState()).toEqual(initial);
  });

  it('returns one playSequence result per move and invokes callbacks in order', () => {
    const worker = createGameWorker();
    worker.init(TEST_DEF, 14);

    const callbackIndices: number[] = [];
    const results = worker.playSequence([LEGAL_TICK_MOVE, LEGAL_TICK_MOVE], (_result, index) => {
      callbackIndices.push(index);
    });

    expect(results).toHaveLength(2);
    expect(callbackIndices).toEqual([0, 1]);
    expect(worker.getHistoryLength()).toBe(2);
    expect(worker.getState().globalVars.tick).toBe(2);
  });

  it('applies successful playSequence steps and keeps history consistent on failure', () => {
    const worker = createGameWorker();
    worker.init(TEST_DEF, 15);

    const callbackIndices: number[] = [];

    try {
      worker.playSequence([LEGAL_TICK_MOVE, ILLEGAL_MOVE], (_result, index) => {
        callbackIndices.push(index);
      });
      throw new Error('Expected playSequence to throw');
    } catch (error) {
      expectWorkerError(error, 'ILLEGAL_MOVE');
    }

    expect(callbackIndices).toEqual([0]);
    expect(worker.getHistoryLength()).toBe(1);
    expect(worker.getState().globalVars.tick).toBe(1);
  });

  it('returns null terminal result for non-terminal state', () => {
    const worker = createGameWorker();
    worker.init(TEST_DEF, 16);
    expect(worker.terminalResult()).toBeNull();
  });

  it('supports metadata, undo, and reset lifecycle', () => {
    const worker = createGameWorker();
    const initial = worker.init(TEST_DEF, 17);

    const metadata = worker.getMetadata();
    expect(metadata).toEqual({
      gameId: 'runner-worker-test',
      playerCount: 2,
      phaseNames: ['main'],
      actionNames: ['tick'],
      zoneNames: ['table:none'],
    });

    worker.applyMove(LEGAL_TICK_MOVE);
    expect(worker.getHistoryLength()).toBe(1);
    expect(worker.getState().globalVars.tick).toBe(1);

    const undone = worker.undo();
    expect(undone).toEqual(initial);
    expect(worker.getHistoryLength()).toBe(0);

    worker.applyMove(LEGAL_TICK_MOVE);
    expect(worker.getHistoryLength()).toBe(1);

    const reset = worker.reset();
    expect(reset.globalVars.tick).toBe(0);
    expect(worker.getHistoryLength()).toBe(0);
  });

  it('returns null when undo is called on initial state', () => {
    const worker = createGameWorker();
    worker.init(TEST_DEF, 18);
    expect(worker.undo()).toBeNull();
  });

  it('supports reset with new seed, new def, and new playerCount', () => {
    const worker = createGameWorker();
    const initial = worker.init(RANGE_TEST_DEF, 19, { playerCount: 2 });

    const reseeded = worker.reset(undefined, 20);
    expect(reseeded.rng.state).not.toEqual(initial.rng.state);
    expect(worker.getHistoryLength()).toBe(0);

    const resetWithNewDef = worker.reset(ALT_TEST_DEF, 21, { playerCount: 3 });
    expect(resetWithNewDef.playerCount).toBe(3);
    expect(worker.getMetadata()).toEqual({
      gameId: 'runner-worker-test-alt',
      playerCount: 3,
      phaseNames: ['main'],
      actionNames: ['tick-alt'],
      zoneNames: ['table:none'],
    });

    const resetWithNewPlayerCount = worker.reset(RANGE_TEST_DEF, 22, { playerCount: 4 });
    expect(resetWithNewPlayerCount.playerCount).toBe(4);
  });

  it('loads and initializes a GameDef from URL', async () => {
    const worker = createGameWorker();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(TEST_DEF), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const state = await worker.loadFromUrl('https://example.com/game-def.json', 23, {
      playerCount: 2,
      enableTrace: false,
    });

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/game-def.json');
    expect(state.playerCount).toBe(2);
    expect(worker.getHistoryLength()).toBe(0);

    const applyResult = worker.applyMove(LEGAL_TICK_MOVE);
    expect(applyResult.effectTrace).toBeUndefined();
  });

  it('throws VALIDATION_FAILED when URL fetch fails with non-OK status', async () => {
    const worker = createGameWorker();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404, statusText: 'Not Found' })));

    await expect(worker.loadFromUrl('https://example.com/missing.json', 5)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Failed to fetch GameDef: 404 Not Found',
    });
  });

  it('throws VALIDATION_FAILED when URL payload is invalid JSON', async () => {
    const worker = createGameWorker();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{invalid-json', { status: 200 })));

    await expect(worker.loadFromUrl('https://example.com/bad-json.json', 5)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('throws VALIDATION_FAILED when URL payload is not a valid GameDef', async () => {
    const worker = createGameWorker();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ invalid: true }), { status: 200 })));

    try {
      await worker.loadFromUrl('https://example.com/invalid-def.json', 5);
      throw new Error('Expected loadFromUrl to throw');
    } catch (error) {
      const workerError = expectWorkerError(error, 'VALIDATION_FAILED');
      expect(workerError.message).toContain('Invalid GameDef from URL:');
    }
  });
});
