import { createGrantLifecycleTraceEntry } from './grant-lifecycle-trace.js';
import { kernelRuntimeError } from './runtime-error.js';
import type {
  GrantLifecyclePhase,
  TurnFlowPendingFreeOperationGrant,
  TurnFlowGrantLifecycleTraceEntry,
} from './types.js';

export interface GrantLifecycleTransitionResult {
  readonly grant: TurnFlowPendingFreeOperationGrant;
  readonly traceEntry: TurnFlowGrantLifecycleTraceEntry;
}

const invalidGrantLifecycleTransition = (
  transition: string,
  grant: TurnFlowPendingFreeOperationGrant,
  detail: string,
): never => {
  throw kernelRuntimeError(
    'RUNTIME_CONTRACT_INVALID',
    `Grant lifecycle transition "${transition}" is invalid for grant "${grant.grantId}": ${detail}.`,
  );
};

const assertPhase = (
  transition: string,
  grant: TurnFlowPendingFreeOperationGrant,
  expected: readonly GrantLifecyclePhase[],
): void => {
  if (expected.includes(grant.phase)) {
    return;
  }
  invalidGrantLifecycleTransition(
    transition,
    grant,
    `expected phase ${expected.join(' or ')}, received ${grant.phase}`,
  );
};

const transitionGrant = (
  step: TurnFlowGrantLifecycleTraceEntry['step'],
  grant: TurnFlowPendingFreeOperationGrant,
  nextGrant: TurnFlowPendingFreeOperationGrant,
): GrantLifecycleTransitionResult => ({
  grant: nextGrant,
  traceEntry: createGrantLifecycleTraceEntry(step, grant, nextGrant),
});

export const advanceToReady = (
  grant: TurnFlowPendingFreeOperationGrant,
): GrantLifecycleTransitionResult => {
  assertPhase('advanceToReady', grant, ['sequenceWaiting']);
  return transitionGrant('advanceToReady', grant, {
    ...grant,
    phase: 'ready',
  });
};

export const markOffered = (
  grant: TurnFlowPendingFreeOperationGrant,
): GrantLifecycleTransitionResult => {
  assertPhase('markOffered', grant, ['ready']);
  return transitionGrant('markOffered', grant, {
    ...grant,
    phase: 'offered',
  });
};

export const consumeUse = (
  grant: TurnFlowPendingFreeOperationGrant,
): GrantLifecycleTransitionResult => {
  assertPhase('consumeUse', grant, ['ready', 'offered']);
  if (grant.remainingUses <= 0) {
    invalidGrantLifecycleTransition(
      'consumeUse',
      grant,
      `remainingUses must be positive, received ${grant.remainingUses}`,
    );
  }
  const nextRemainingUses = grant.remainingUses - 1;
  return transitionGrant('consumeUse', grant, {
    ...grant,
    phase: nextRemainingUses === 0 ? 'exhausted' : 'ready',
    remainingUses: nextRemainingUses,
  });
};

export const skipGrant = (
  grant: TurnFlowPendingFreeOperationGrant,
): GrantLifecycleTransitionResult => {
  assertPhase('skipGrant', grant, ['ready', 'offered']);
  if (grant.completionPolicy !== 'skipIfNoLegalCompletion') {
    invalidGrantLifecycleTransition(
      'skipGrant',
      grant,
      `completionPolicy must be skipIfNoLegalCompletion, received ${grant.completionPolicy ?? 'undefined'}`,
    );
  }
  return transitionGrant('skipGrant', grant, {
    ...grant,
    phase: 'skipped',
  });
};

export const expireGrant = (
  grant: TurnFlowPendingFreeOperationGrant,
): GrantLifecycleTransitionResult => {
  assertPhase('expireGrant', grant, ['ready', 'offered']);
  if (
    grant.completionPolicy !== 'required'
    && grant.completionPolicy !== 'skipIfNoLegalCompletion'
  ) {
    invalidGrantLifecycleTransition(
      'expireGrant',
      grant,
      `completionPolicy must be required or skipIfNoLegalCompletion, received ${grant.completionPolicy ?? 'undefined'}`,
    );
  }
  return transitionGrant('expireGrant', grant, {
    ...grant,
    phase: 'expired',
  });
};
