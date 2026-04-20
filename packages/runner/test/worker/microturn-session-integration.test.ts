import { describe, expect, it } from 'vitest';
import type { ChooseNStepContext } from '../../../engine/src/kernel/microturn/types.js';

import { createGameWorker, type OperationStamp } from '../../src/worker/game-worker-api.js';
import { CHOOSE_N_TEST_DEF } from './test-fixtures.js';

const createStampFactory = (): (() => OperationStamp) => {
  let token = 0;
  return () => ({ epoch: 0, token: ++token });
};

describe('microturn session integration', () => {
  it('publishes chooseN frontier, applies sequential decisions, and rewinds to the turn boundary', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(CHOOSE_N_TEST_DEF, 42, undefined, nextStamp());

    const initialActionSelection = await worker.publishMicroturn();
    const turnId = initialActionSelection.turnId;
    await worker.applyDecision(initialActionSelection.legalActions[0]!, undefined, nextStamp());

    const chooseN = await worker.publishMicroturn();
    expect(chooseN.kind).toBe('chooseNStep');
    expect(chooseN.legalActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'chooseNStep', command: 'add', value: 'a' }),
        expect.objectContaining({ kind: 'chooseNStep', command: 'add', value: 'b' }),
      ]),
    );

    const addA = chooseN.legalActions.find(
      (decision) => decision.kind === 'chooseNStep' && decision.command === 'add' && decision.value === 'a',
    );
    expect(addA).toBeDefined();
    await worker.applyDecision(addA!, undefined, nextStamp());

    const pendingAfterAdd = await worker.publishMicroturn();
    expect(pendingAfterAdd.kind).toBe('chooseNStep');
    if (pendingAfterAdd.kind !== 'chooseNStep') {
      throw new Error('Expected chooseNStep microturn.');
    }
    const pendingContext = pendingAfterAdd.decisionContext as ChooseNStepContext;
    expect(pendingContext.selectedSoFar).toEqual(['a']);

    const confirm = pendingAfterAdd.legalActions.find(
      (decision) => decision.kind === 'chooseNStep' && decision.command === 'confirm',
    );
    expect(confirm).toBeDefined();
    const finalResult = await worker.applyDecision(confirm!, undefined, nextStamp());
    expect(finalResult.log.turnRetired).toBe(true);

    const rewound = await worker.rewindToTurnBoundary(turnId, nextStamp());
    expect(rewound).not.toBeNull();
    const rewoundMicroturn = await worker.publishMicroturn();
    expect(rewoundMicroturn.kind).toBe('actionSelection');
  });

  it('rejects stale mutation stamps after a successful mutation', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(CHOOSE_N_TEST_DEF, 99, undefined, nextStamp());

    const microturn = await worker.publishMicroturn();
    const firstStamp = nextStamp();
    await worker.applyDecision(microturn.legalActions[0]!, undefined, firstStamp);

    await expect(worker.advanceAutoresolvable(undefined, firstStamp)).rejects.toMatchObject({
      code: 'STALE_OPERATION',
    });
  });
});
