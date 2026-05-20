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

describe('post-grant preview continuation', () => {
  it('keeps opt-out profiles at the outcomeGrantResolve boundary and lets opt-in profiles continue', () => {
    const def = createPostGrantDef();
    const state = createBaseState();
    const trustedMove = createTrustedOperation(state);
    const candidate = { move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'operation' };

    const optOutRuntime = createRuntime(def, state, trustedMove, ['grant-a']);
    const optOutPreview = optOutRuntime.getPreviewState(candidate);
    assert.equal(optOutRuntime.getOutcome(candidate), 'grantFlowPartial');
    assert.equal(optOutRuntime.getPreviewDrive(candidate)?.kind, 'completed');
    assert.equal(grantPhase(optOutPreview, 'grant-a'), 'ready');

    const optInRuntime = createRuntime(def, state, trustedMove, ['grant-a'], {
      enabled: true,
      postGrantDepthCap: 4,
      postGrantCapClass: 'postGrant16',
      freeOperationDepthCap: 16,
      freeOperationCapClass: 'grantFlow16',
    });
    const optInPreview = optInRuntime.getPreviewState(candidate);
    assert.equal(optInRuntime.getOutcome(candidate), 'grantFlowPartial');
    assert.equal(optInRuntime.getPreviewDrive(candidate)?.kind, 'completed');
    assert.equal(grantPhase(optInPreview, 'grant-a'), 'offered');

    const repeatedOptInRuntime = createRuntime(def, state, trustedMove, ['grant-a'], {
      enabled: true,
      postGrantDepthCap: 4,
      postGrantCapClass: 'postGrant16',
      freeOperationDepthCap: 16,
      freeOperationCapClass: 'grantFlow16',
    });
    assert.deepEqual(
      {
        outcome: repeatedOptInRuntime.getOutcome(candidate),
        drive: repeatedOptInRuntime.getPreviewDrive(candidate),
        grantPhase: grantPhase(repeatedOptInRuntime.getPreviewState(candidate), 'grant-a'),
      },
      {
        outcome: optInRuntime.getOutcome(candidate),
        drive: optInRuntime.getPreviewDrive(candidate),
        grantPhase: grantPhase(optInPreview, 'grant-a'),
      },
    );
  });
});
