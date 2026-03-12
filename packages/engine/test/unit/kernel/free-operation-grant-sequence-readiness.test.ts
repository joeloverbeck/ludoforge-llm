import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isPendingFreeOperationGrantSequenceReady } from '../../../src/kernel/free-operation-grant-authorization.js';
import type { TurnFlowPendingFreeOperationGrant, TurnFlowRuntimeState } from '../../../src/kernel/types.js';

const makeGrant = (
  grantId: string,
  sequenceIndex: number,
): TurnFlowPendingFreeOperationGrant => ({
  grantId,
  seat: sequenceIndex === 0 ? 'us' : 'arvn',
  operationClass: 'specialActivity',
  actionIds: sequenceIndex === 0 ? ['airLift'] : ['transport'],
  viabilityPolicy: 'requireUsableAtIssue',
  completionPolicy: 'required',
  postResolutionTurnFlow: 'resumeCardFlow',
  remainingUses: 1,
  sequenceBatchId: 'macv-us-then-arvn',
  sequenceIndex,
});

const implementWhatCanContext: TurnFlowRuntimeState['freeOperationSequenceContexts'] = {
  'macv-us-then-arvn': {
    capturedMoveZonesByKey: {},
    progressionPolicy: 'implementWhatCanInOrder',
    skippedStepIndices: [],
  },
};

describe('free-operation grant sequence readiness', () => {
  it('treats consumed earlier implementWhatCanInOrder steps as non-blocking', () => {
    const laterGrant = makeGrant('grant-1', 1);

    assert.equal(
      isPendingFreeOperationGrantSequenceReady([laterGrant], laterGrant, implementWhatCanContext),
      true,
    );
  });

  it('keeps earlier pending implementWhatCanInOrder steps blocking until they resolve', () => {
    const firstGrant = makeGrant('grant-0', 0);
    const laterGrant = makeGrant('grant-1', 1);

    assert.equal(
      isPendingFreeOperationGrantSequenceReady([firstGrant, laterGrant], laterGrant, implementWhatCanContext),
      false,
    );
  });
});
