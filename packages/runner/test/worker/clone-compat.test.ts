import { deepStrictEqual } from 'node:assert/strict';

import { describe, expect, it } from 'vitest';

import { createGameWorker, type OperationStamp } from '../../src/worker/game-worker-api.js';
import { CHOOSE_N_TEST_DEF, LEGAL_TICK_MOVE, TEST_DEF } from './test-fixtures.js';

const roundTripClone = <T>(value: T): T => {
  const cloned = structuredClone(value);
  deepStrictEqual(cloned, value);
  return cloned;
};

const createStampFactory = (): (() => OperationStamp) => {
  let token = 0;
  return () => ({ epoch: 0, token: ++token });
};

describe('worker boundary structured clone compatibility', () => {
  it('round-trips microturn-native worker results', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    const initResult = await worker.init(TEST_DEF, 31, undefined, nextStamp());
    const microturn = await worker.publishMicroturn();
    const decisionResult = await worker.applyDecision(microturn.legalActions[0]!, undefined, nextStamp());

    roundTripClone(TEST_DEF);
    const clonedInitResult = roundTripClone(initResult);
    roundTripClone(microturn);
    roundTripClone(decisionResult);
    roundTripClone(await worker.terminalResult());

    expect(typeof clonedInitResult.state.stateHash).toBe('bigint');
    expect(typeof clonedInitResult.state.rng.state[0]).toBe('bigint');
  });

  it('round-trips replay compatibility helpers', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(TEST_DEF, 43, undefined, nextStamp());

    const replayResult = await worker.applyReplayMove(LEGAL_TICK_MOVE, undefined, nextStamp());
    roundTripClone(replayResult);

    await worker.reset(undefined, 43, undefined, nextStamp());
    const sequenceResult = await worker.playSequence([LEGAL_TICK_MOVE, LEGAL_TICK_MOVE], undefined, nextStamp());
    roundTripClone(sequenceResult);
    expect(sequenceResult).toHaveLength(2);
  });

  it('round-trips chooseN microturn progression', async () => {
    const worker = createGameWorker();
    const nextStamp = createStampFactory();
    await worker.init(CHOOSE_N_TEST_DEF, 55, undefined, nextStamp());

    const actionSelection = await worker.publishMicroturn();
    await worker.applyDecision(actionSelection.legalActions[0]!, undefined, nextStamp());
    const chooseN = await worker.publishMicroturn();
    const addDecision = chooseN.legalActions.find(
      (decision) => decision.kind === 'chooseNStep' && decision.command === 'add',
    );

    roundTripClone(chooseN);
    roundTripClone(addDecision);
    expect(addDecision).toBeDefined();
  });
});
