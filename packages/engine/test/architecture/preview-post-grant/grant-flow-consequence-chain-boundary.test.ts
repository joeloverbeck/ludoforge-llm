// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createActionSelectionState,
  createBaseState,
  createPostGrantDef,
  createRuntime,
  createTrustedOperation,
} from './post-grant-fixture.js';

const grantFlowContinuation = {
  enabled: true,
  postGrantDepthCap: 4,
  postGrantCapClass: 'postGrant16',
  freeOperationDepthCap: 16,
  freeOperationCapClass: 'grantFlow16',
} as const;

describe('grant-flow preview consequence-chain boundary', () => {
  it('does not advance into a fresh independent action selection', () => {
    const def = createPostGrantDef();
    const state = createBaseState();
    const trustedMove = createTrustedOperation(state);
    const candidate = { move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'operation' };
    const independentState = createActionSelectionState(state);
    const runtime = createRuntime(def, state, trustedMove, [], grantFlowContinuation, independentState);

    const preview = runtime.getPreviewState(candidate);
    assert.equal(runtime.getOutcome(candidate), 'ready');
    assert.equal(runtime.getPreviewDrive(candidate)?.depth, 1);
    assert.equal(preview?.globalVars.target, 0);
  });

  it('does not advance into a non-origin seat action selection', () => {
    const def = createPostGrantDef();
    const state = createBaseState();
    const trustedMove = createTrustedOperation(state);
    const candidate = { move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'operation' };
    const otherSeatState = createActionSelectionState(state, '1');
    const runtime = createRuntime(def, state, trustedMove, [], grantFlowContinuation, otherSeatState);

    const preview = runtime.getPreviewState(candidate);
    assert.equal(runtime.getOutcome(candidate), 'ready');
    assert.equal(runtime.getPreviewDrive(candidate)?.depth, 1);
    assert.equal(preview?.globalVars.target, 0);
  });
});
