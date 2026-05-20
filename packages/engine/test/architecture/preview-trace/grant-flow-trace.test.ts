// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createBaseState,
  createPostGrantDef,
  createRuntime,
  createTrustedOperation,
} from '../preview-post-grant/post-grant-fixture.js';

const grantFlowContinuation = {
  enabled: true,
  postGrantDepthCap: 4,
  postGrantCapClass: 'postGrant16',
  freeOperationDepthCap: 16,
  freeOperationCapClass: 'grantFlow16',
} as const;

describe('grant-flow preview trace provenance', () => {
  it('records the ordered grant-flow path for completed continuation', () => {
    const def = createPostGrantDef();
    const state = createBaseState();
    const trustedMove = createTrustedOperation(state);
    const candidate = { move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'operation' };
    const runtime = createRuntime(def, state, trustedMove, ['grant-a'], grantFlowContinuation);

    assert.equal(runtime.getOutcome(candidate), 'ready');
    const drive = runtime.getPreviewDrive(candidate);
    assert.equal(drive?.kind, 'completed');
    assert.equal(drive?.completionPolicy, 'greedy');
    assert.deepEqual(
      drive?.grantFlowSegments?.map((segment) => segment.kind),
      [
        'outcomeGrantResolve',
        'grantOffered',
        'freeOperationActionSelection',
        'selectedFreeOperation',
        'deferredEffectsReleased',
        'grantConsumed',
      ],
    );
    assert.deepEqual(drive?.grantFlowSegments?.map((segment) => segment.depth), [1, 1, 1, 1, 1, 1]);
    assert.deepEqual(drive?.grantFlowSegments?.map((segment) => segment.grantId ?? null), [
      'grant-a',
      'grant-a',
      null,
      null,
      null,
      'grant-a',
    ]);
    assert.equal(drive?.grantFlowSegments?.[3]?.actionId, 'operation');
  });

  it('records cap exits with the path segment reached before the cap', () => {
    const def = createPostGrantDef();
    const state = createBaseState();
    const trustedMove = createTrustedOperation(state);
    const candidate = { move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'operation' };
    const runtime = createRuntime(def, state, trustedMove, ['grant-a'], {
      ...grantFlowContinuation,
      freeOperationDepthCap: 0,
    });

    assert.equal(runtime.getOutcome(candidate), 'freeOperationCap');
    const drive = runtime.getPreviewDrive(candidate);
    assert.equal(drive?.kind, 'freeOperationCap');
    assert.deepEqual(
      drive?.grantFlowSegments?.map((segment) => segment.kind),
      ['outcomeGrantResolve', 'grantOffered'],
    );
  });
});
