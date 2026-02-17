import { describe, expect, it } from 'vitest';

import { createGameWorker, type WorkerError } from '../../src/worker/game-worker-api';
import { ILLEGAL_MOVE, LEGAL_TICK_MOVE, TEST_DEF } from './test-fixtures';

const expectWorkerError = (error: unknown, code: WorkerError['code']): WorkerError => {
  expect(error).toMatchObject({ code });
  expect(typeof (error as { readonly message?: unknown }).message).toBe('string');
  return error as WorkerError;
};

describe('createGameWorker', () => {
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

  it('respects init-level trace config', () => {
    const worker = createGameWorker();
    worker.init(TEST_DEF, 9, { enableTrace: false });

    const result = worker.applyMove(LEGAL_TICK_MOVE);
    expect(result.effectTrace).toBeUndefined();
  });

  it('rolls back history when applyMove fails', () => {
    const worker = createGameWorker();
    const initial = worker.init(TEST_DEF, 11);

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

  it('applies successful playSequence steps and keeps history consistent on failure', () => {
    const worker = createGameWorker();
    worker.init(TEST_DEF, 13);

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
});
