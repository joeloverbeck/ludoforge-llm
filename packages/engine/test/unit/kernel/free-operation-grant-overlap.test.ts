import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  freeOperationGrantEquivalenceKey,
  freeOperationGrantOverlapSurfaceKey,
} from '../../../src/kernel/free-operation-grant-overlap.js';

const baseGrant = {
  seat: '0',
  executeAsSeat: '1',
  operationClass: 'operation',
  allowDuringMonsoon: true,
  viabilityPolicy: 'requireUsableAtIssue',
  sequenceContext: { requireMoveZoneCandidatesFrom: 'captured' },
} as const;

describe('free-operation grant overlap classifier', () => {
  it('normalizes overlap surface keys independently of actionId order', () => {
    const left = freeOperationGrantOverlapSurfaceKey(baseGrant, ['b', 'a']);
    const right = freeOperationGrantOverlapSurfaceKey(baseGrant, ['a', 'b']);

    assert.equal(left, right);
  });

  it('includes policy fields in equivalence classification', () => {
    const weaker = freeOperationGrantEquivalenceKey(baseGrant, ['operation']);
    const stronger = freeOperationGrantEquivalenceKey(
      {
        ...baseGrant,
        completionPolicy: 'required',
        outcomePolicy: 'mustChangeGameplayState',
        postResolutionTurnFlow: 'resumeCardFlow',
      },
      ['operation'],
    );

    assert.notEqual(weaker, stronger);
  });

  it('supports runtime-only additive extensions without changing the shared base surface', () => {
    const overlap = freeOperationGrantOverlapSurfaceKey(baseGrant, ['operation']);
    const runtimeA = freeOperationGrantEquivalenceKey(baseGrant, ['operation'], {
      additionalFields: {
        remainingUses: 1,
        deferredDependencyProfile: ['deferred-a'],
        sequenceBatchId: 'batch-0',
        sequenceIndex: 0,
      },
    });
    const runtimeB = freeOperationGrantEquivalenceKey(baseGrant, ['operation'], {
      additionalFields: {
        remainingUses: 2,
        deferredDependencyProfile: ['deferred-b'],
        sequenceBatchId: 'batch-0',
        sequenceIndex: 1,
      },
    });

    assert.notEqual(runtimeA, runtimeB);
    assert.equal(overlap, freeOperationGrantOverlapSurfaceKey(baseGrant, ['operation']));
  });

  it('supports declarative extensions such as uses and sequence identity only when the caller opts in', () => {
    const declarativeWithoutSequence = freeOperationGrantEquivalenceKey(baseGrant, ['operation'], {
      additionalFields: { uses: 1 },
    });
    const declarativeWithSequence = freeOperationGrantEquivalenceKey(baseGrant, ['operation'], {
      additionalFields: {
        uses: 1,
        sequence: { batch: 'alpha', step: 0 },
      },
    });

    assert.notEqual(declarativeWithoutSequence, declarativeWithSequence);
  });
});
