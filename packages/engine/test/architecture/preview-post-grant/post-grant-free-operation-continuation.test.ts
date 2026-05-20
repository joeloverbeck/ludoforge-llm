// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createBaseState,
  createPostGrantDef,
  createRuntime,
  createTrustedOperation,
  grantPhase,
} from './post-grant-fixture.js';

const grantFlowContinuation = {
  enabled: true,
  postGrantDepthCap: 4,
  postGrantCapClass: 'postGrant16',
  freeOperationDepthCap: 16,
  freeOperationCapClass: 'grantFlow16',
} as const;

describe('post-grant free-operation preview continuation', () => {
  it('executes the offered free operation through the real action path', () => {
    const def = createPostGrantDef();
    const state = createBaseState();
    const trustedMove = createTrustedOperation(state);
    const candidate = { move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'operation' };

    const optOutRuntime = createRuntime(def, state, trustedMove, ['grant-a']);
    const optOutPreview = optOutRuntime.getPreviewState(candidate);
    assert.equal(optOutRuntime.getOutcome(candidate), 'grantFlowPartial');
    assert.equal(grantPhase(optOutPreview, 'grant-a'), 'ready');
    assert.equal(optOutPreview?.globalVars.target, 0);

    const optInRuntime = createRuntime(def, state, trustedMove, ['grant-a'], grantFlowContinuation);
    const optInPreview = optInRuntime.getPreviewState(candidate);
    assert.equal(optInRuntime.getOutcome(candidate), 'ready');
    assert.equal(grantPhase(optInPreview, 'grant-a'), undefined);
    assert.equal(optInPreview?.globalVars.target, 1);
    assert.equal(optInRuntime.getPreviewDrive(candidate)?.depth, 2);
    assert.equal(optInRuntime.getGrantFlowContinuationDepth(candidate), 2);
  });

  it('returns freeOperationCap when the free-operation segment budget is exhausted', () => {
    const def = createPostGrantDef();
    const state = createBaseState();
    const trustedMove = createTrustedOperation(state);
    const candidate = { move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'operation' };

    const runtime = createRuntime(def, state, trustedMove, ['grant-a'], {
      ...grantFlowContinuation,
      freeOperationDepthCap: 0,
    });

    assert.equal(runtime.getOutcome(candidate), 'freeOperationCap');
    assert.equal(runtime.getPreviewDrive(candidate)?.kind, 'freeOperationCap');
    assert.equal(runtime.getPreviewState(candidate), undefined);
  });
});
