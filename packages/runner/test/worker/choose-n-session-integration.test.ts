import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGameWorker, type OperationStamp } from '../../src/worker/game-worker-api';
import { CHOOSE_N_TEST_DEF } from './test-fixtures';
import * as runtime from '@ludoforge/engine/runtime';
import { asActionId, type ChoicePendingChooseNRequest, type DecisionKey, type Move } from '@ludoforge/engine/runtime';

const createStampFactory = (): (() => OperationStamp) => {
  let token = 0;
  return () => ({ epoch: 0, token: ++token });
};

const PICK_MANY_MOVE: Move = {
  actionId: asActionId('pick-many'),
  params: {},
};

/** Extract the actual decisionKey from a chooseN pending request. */
const getChooseNDecisionKey = (request: runtime.ChoiceRequest): DecisionKey => {
  if (request.kind !== 'pending' || !('type' in request) || request.type !== 'chooseN') {
    throw new Error('Expected chooseN pending request');
  }
  return (request as ChoicePendingChooseNRequest).decisionKey;
};

/** Init worker and discover chooseN, returning the worker, decision key, and stamp factory. */
const setupChooseN = async (seed: number) => {
  const worker = createGameWorker();
  const nextStamp = createStampFactory();
  await worker.init(CHOOSE_N_TEST_DEF, seed, undefined, nextStamp());
  const choices = await worker.legalChoices(PICK_MANY_MOVE);
  const dk = getChooseNDecisionKey(choices);
  return { worker, nextStamp, dk };
};

describe('chooseN session integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates session on chooseN discovery and uses it for subsequent toggles', async () => {
    const { worker, dk } = await setupChooseN(42);

    const sessionSpy = vi.spyOn(runtime, 'advanceChooseNWithSession');
    const statelessSpy = vi.spyOn(runtime, 'advanceChooseN');

    const result = await worker.advanceChooseN(
      PICK_MANY_MOVE, dk, [], { type: 'add', value: 'a' },
    );

    expect(sessionSpy).toHaveBeenCalledTimes(1);
    expect(statelessSpy).not.toHaveBeenCalled();
    expect(result.done).toBe(false);
    if (!result.done) {
      expect(result.pending.selected).toEqual(['a']);
    }
  });

  it('invalidates session on undo and falls back to stateless', async () => {
    const { worker, nextStamp, dk } = await setupChooseN(44);

    const sessionSpy = vi.spyOn(runtime, 'advanceChooseNWithSession');
    const statelessSpy = vi.spyOn(runtime, 'advanceChooseN');

    // Verify session is active.
    await worker.advanceChooseN(
      PICK_MANY_MOVE, dk, [], { type: 'add', value: 'a' },
    );
    expect(sessionSpy).toHaveBeenCalledTimes(1);
    sessionSpy.mockClear();
    statelessSpy.mockClear();

    // Undo increments revision → session invalidated.
    await worker.undo(nextStamp());

    // Without re-discovering, advanceChooseN should use stateless path.
    const result = await worker.advanceChooseN(
      PICK_MANY_MOVE, dk, [], { type: 'add', value: 'a' },
    );
    expect(sessionSpy).not.toHaveBeenCalled();
    expect(statelessSpy).toHaveBeenCalledTimes(1);
    expect(result.done).toBe(false);
  });

  it('uses stateless path when session is not eligible', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(CHOOSE_N_TEST_DEF, 45, undefined, nextStamp());

    // Mock eligibility BEFORE legalChoices so no session is created.
    vi.spyOn(runtime, 'isChooseNSessionEligible').mockReturnValue(false);

    const choices = await worker.legalChoices(PICK_MANY_MOVE);
    const dk = getChooseNDecisionKey(choices);

    const sessionSpy = vi.spyOn(runtime, 'advanceChooseNWithSession');
    const statelessSpy = vi.spyOn(runtime, 'advanceChooseN');

    const result = await worker.advanceChooseN(
      PICK_MANY_MOVE, dk, [], { type: 'add', value: 'a' },
    );

    expect(sessionSpy).not.toHaveBeenCalled();
    expect(statelessSpy).toHaveBeenCalledTimes(1);
    expect(result.done).toBe(false);
  });

  it('session path produces identical results to stateless path', async () => {
    // Worker with session.
    const { worker: w1, dk: dk1 } = await setupChooseN(99);
    const r1a = await w1.advanceChooseN(PICK_MANY_MOVE, dk1, [], { type: 'add', value: 'a' });
    const r1b = await w1.advanceChooseN(PICK_MANY_MOVE, dk1, ['a'], { type: 'add', value: 'b' });

    // Worker without session.
    const w2 = createGameWorker();
    const ns2 = createStampFactory();
    await w2.init(CHOOSE_N_TEST_DEF, 99, undefined, ns2());
    vi.spyOn(runtime, 'isChooseNSessionEligible').mockReturnValue(false);
    const choices2 = await w2.legalChoices(PICK_MANY_MOVE);
    const dk2 = getChooseNDecisionKey(choices2);
    vi.restoreAllMocks();

    const r2a = await w2.advanceChooseN(PICK_MANY_MOVE, dk2, [], { type: 'add', value: 'a' });
    const r2b = await w2.advanceChooseN(PICK_MANY_MOVE, dk2, ['a'], { type: 'add', value: 'b' });

    expect(r1a.done).toBe(r2a.done);
    expect(r1b.done).toBe(r2b.done);
    if (!r1a.done && !r2a.done) {
      expect(r1a.pending.selected).toEqual(r2a.pending.selected);
      expect(r1a.pending.canConfirm).toBe(r2a.pending.canConfirm);
    }
    if (!r1b.done && !r2b.done) {
      expect(r1b.pending.selected).toEqual(r2b.pending.selected);
      expect(r1b.pending.canConfirm).toBe(r2b.pending.canConfirm);
    }
  });

  it('rapid add/add/remove/add sequence tracks cumulative state correctly', async () => {
    const { worker, dk } = await setupChooseN(77);

    const r1 = await worker.advanceChooseN(PICK_MANY_MOVE, dk, [], { type: 'add', value: 'a' });
    expect(r1.done).toBe(false);
    if (!r1.done) {
      expect(r1.pending.selected).toEqual(['a']);
      expect(r1.pending.canConfirm).toBe(true);
    }

    const r2 = await worker.advanceChooseN(PICK_MANY_MOVE, dk, ['a'], { type: 'add', value: 'b' });
    expect(r2.done).toBe(false);
    if (!r2.done) {
      expect(r2.pending.selected).toEqual(['a', 'b']);
      expect(r2.pending.canConfirm).toBe(true);
    }

    const r3 = await worker.advanceChooseN(PICK_MANY_MOVE, dk, ['a', 'b'], { type: 'remove', value: 'a' });
    expect(r3.done).toBe(false);
    if (!r3.done) {
      expect(r3.pending.selected).toEqual(['b']);
      expect(r3.pending.canConfirm).toBe(true);
    }

    const r4 = await worker.advanceChooseN(PICK_MANY_MOVE, dk, ['b'], { type: 'add', value: 'c' });
    expect(r4.done).toBe(false);
    if (!r4.done) {
      expect(r4.pending.selected).toEqual(['b', 'c']);
      expect(r4.pending.canConfirm).toBe(true);
    }

    const r5 = await worker.advanceChooseN(PICK_MANY_MOVE, dk, ['b', 'c'], { type: 'confirm' });
    expect(r5.done).toBe(true);
    if (r5.done) {
      expect(r5.value).toEqual(['b', 'c']);
    }
  });

  it('falls back to stateless path when session throws', async () => {
    const { worker, dk } = await setupChooseN(50);

    const sessionSpy = vi.spyOn(runtime, 'advanceChooseNWithSession').mockImplementation(() => {
      throw new Error('Session error');
    });
    const statelessSpy = vi.spyOn(runtime, 'advanceChooseN');

    const result = await worker.advanceChooseN(
      PICK_MANY_MOVE, dk, [], { type: 'add', value: 'a' },
    );

    expect(sessionSpy).toHaveBeenCalledTimes(1);
    expect(statelessSpy).toHaveBeenCalledTimes(1);
    expect(result.done).toBe(false);
  });

  it('legalChoices replaces previous session with new one', async () => {
    const { worker, dk } = await setupChooseN(60);

    const sessionSpy = vi.spyOn(runtime, 'advanceChooseNWithSession');

    await worker.advanceChooseN(PICK_MANY_MOVE, dk, [], { type: 'add', value: 'a' });
    expect(sessionSpy).toHaveBeenCalledTimes(1);
    sessionSpy.mockClear();

    // Second legalChoices replaces session.
    const choices2 = await worker.legalChoices(PICK_MANY_MOVE);
    const dk2 = getChooseNDecisionKey(choices2);

    await worker.advanceChooseN(PICK_MANY_MOVE, dk2, [], { type: 'add', value: 'b' });
    expect(sessionSpy).toHaveBeenCalledTimes(1);
  });
});
