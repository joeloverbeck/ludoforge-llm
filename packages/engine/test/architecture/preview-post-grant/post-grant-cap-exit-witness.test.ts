// @test-class: convergence-witness
// @witness: spec-179-post-grant-cap-exit

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createBaseState,
  createPostGrantDef,
  createRuntime,
  createTrustedOperation,
} from './post-grant-fixture.js';

describe('post-grant preview cap exit', () => {
  it('reports postGrantCap instead of depthCap when the extra grant budget is exhausted', () => {
    const def = createPostGrantDef();
    const state = createBaseState();
    const trustedMove = createTrustedOperation(state);
    const runtime = createRuntime(def, state, trustedMove, ['grant-a', 'grant-b'], {
      enabled: true,
      extraDepthCap: 1,
      capClass: 'postGrant16',
    });
    const candidate = { move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'operation' };

    assert.equal(runtime.getOutcome(candidate), 'postGrantCap');
    assert.equal(runtime.getPreviewDrive(candidate)?.kind, 'postGrantCap');
    assert.equal(runtime.getPreviewDrive(candidate)?.depth, 1);
    assert.equal(runtime.getPreviewState(candidate), undefined);
  });
});
