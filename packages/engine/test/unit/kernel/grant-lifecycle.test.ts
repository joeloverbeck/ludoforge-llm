import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advanceToReady,
  consumeUse,
  expireGrant,
  markOffered,
  skipGrant,
  type TurnFlowPendingFreeOperationGrant,
} from '../../../src/kernel/index.js';

const makeGrant = (
  overrides?: Partial<TurnFlowPendingFreeOperationGrant>,
): TurnFlowPendingFreeOperationGrant => ({
  grantId: 'grant-0',
  phase: 'ready',
  seat: '0',
  operationClass: 'operation',
  actionIds: ['operation'],
  remainingUses: 2,
  ...overrides,
});

describe('grant lifecycle transitions', () => {
  it('advanceToReady moves sequenceWaiting grants to ready and emits a trace entry', () => {
    const grant = makeGrant({ phase: 'sequenceWaiting' });

    const result = advanceToReady(grant);

    assert.equal(result.grant.phase, 'ready');
    assert.equal(grant.phase, 'sequenceWaiting');
    assert.deepEqual(result.traceEntry, {
      kind: 'turnFlowGrantLifecycle',
      step: 'advanceToReady',
      grantId: 'grant-0',
      fromPhase: 'sequenceWaiting',
      toPhase: 'ready',
      seat: '0',
      operationClass: 'operation',
      remainingUsesBefore: 2,
      remainingUsesAfter: 2,
    });
  });

  it('markOffered moves ready grants to offered and is deterministic', () => {
    const grant = makeGrant({ phase: 'ready' });

    const left = markOffered(grant);
    const right = markOffered(grant);

    assert.deepEqual(left, right);
    assert.equal(left.grant.phase, 'offered');
    assert.equal(grant.phase, 'ready');
  });

  it('consumeUse decrements remainingUses and returns ready when uses remain', () => {
    const grant = makeGrant({ phase: 'offered', remainingUses: 2 });

    const result = consumeUse(grant);

    assert.equal(result.grant.phase, 'ready');
    assert.equal(result.grant.remainingUses, 1);
    assert.equal(grant.phase, 'offered');
    assert.equal(grant.remainingUses, 2);
    assert.equal(result.traceEntry.fromPhase, 'offered');
    assert.equal(result.traceEntry.toPhase, 'ready');
    assert.equal(result.traceEntry.remainingUsesBefore, 2);
    assert.equal(result.traceEntry.remainingUsesAfter, 1);
  });

  it('consumeUse exhausts grants when remainingUses reaches zero', () => {
    const grant = makeGrant({ phase: 'ready', remainingUses: 1 });

    const result = consumeUse(grant);

    assert.equal(result.grant.phase, 'exhausted');
    assert.equal(result.grant.remainingUses, 0);
    assert.equal(result.traceEntry.toPhase, 'exhausted');
  });

  it('skipGrant only accepts skipIfNoLegalCompletion grants', () => {
    const grant = makeGrant({
      phase: 'offered',
      completionPolicy: 'skipIfNoLegalCompletion',
    });

    const result = skipGrant(grant);

    assert.equal(result.grant.phase, 'skipped');
    assert.equal(result.traceEntry.fromPhase, 'offered');
    assert.equal(result.traceEntry.toPhase, 'skipped');
  });

  it('expireGrant accepts required grants and emits a trace entry', () => {
    const grant = makeGrant({
      phase: 'ready',
      completionPolicy: 'required',
      postResolutionTurnFlow: 'resumeCardFlow',
    });

    const result = expireGrant(grant);

    assert.equal(result.grant.phase, 'expired');
    assert.equal(result.traceEntry.step, 'expireGrant');
    assert.equal(result.traceEntry.fromPhase, 'ready');
    assert.equal(result.traceEntry.toPhase, 'expired');
  });

  it('throws runtime contract errors for invalid source phases', () => {
    assert.throws(
      () => advanceToReady(makeGrant({ phase: 'ready' })),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && (error as Error & { readonly code?: string }).code === 'RUNTIME_CONTRACT_INVALID',
    );
    assert.throws(
      () => markOffered(makeGrant({ phase: 'sequenceWaiting' })),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && (error as Error & { readonly code?: string }).code === 'RUNTIME_CONTRACT_INVALID',
    );
  });

  it('throws runtime contract errors for invalid policy transitions', () => {
    assert.throws(
      () => skipGrant(makeGrant({ completionPolicy: 'required' })),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && (error as Error & { readonly code?: string }).code === 'RUNTIME_CONTRACT_INVALID',
    );
    assert.throws(
      () => expireGrant(makeGrant()),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && (error as Error & { readonly code?: string }).code === 'RUNTIME_CONTRACT_INVALID',
    );
  });
});
