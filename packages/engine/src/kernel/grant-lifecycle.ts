import { createGrantLifecycleTraceEntry } from './grant-lifecycle-trace.js';
import {
  hasLegalCompletedFreeOperationMoveInCurrentState,
} from './free-operation-viability.js';
import { kernelRuntimeError } from './runtime-error.js';
import type { SeatResolutionContext } from './identity.js';
import type { ResolveMoveDecisionSequenceResult } from './move-decision-sequence.js';
import type { MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import type {
  GameDef,
  GameState,
  GrantLifecyclePhase,
  Move,
  RuntimeWarning,
  TurnFlowPendingFreeOperationGrant,
  TurnFlowGrantLifecycleTraceEntry,
  TurnFlowRuntimeState,
} from './types.js';

export interface GrantLifecycleTransitionResult {
  readonly grant: TurnFlowPendingFreeOperationGrant;
  readonly traceEntry: TurnFlowGrantLifecycleTraceEntry;
}

export interface GrantArrayResult {
  readonly grants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly trace: readonly TurnFlowGrantLifecycleTraceEntry[];
}

export interface GrantArrayConsumeResult extends GrantArrayResult {
  readonly consumed: TurnFlowPendingFreeOperationGrant;
  readonly wasExhausted: boolean;
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

const invalidGrantArrayOperation = (
  operation: string,
  detail: string,
): never => {
  throw kernelRuntimeError(
    'RUNTIME_CONTRACT_INVALID',
    `Grant lifecycle array operation "${operation}" is invalid: ${detail}.`,
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

const assertNoDuplicateGrantIds = (
  operation: string,
  grants: readonly TurnFlowPendingFreeOperationGrant[],
): void => {
  const seen = new Set<string>();
  for (const grant of grants) {
    if (seen.has(grant.grantId)) {
      invalidGrantArrayOperation(
        operation,
        `duplicate grantId "${grant.grantId}"`,
      );
    }
    seen.add(grant.grantId);
  }
};

const assertSequenceOrdering = (
  batch: readonly TurnFlowPendingFreeOperationGrant[],
): void => {
  const lastIndexByBatchId = new Map<string, number>();
  for (const grant of batch) {
    if (grant.sequenceBatchId === undefined || grant.sequenceIndex === undefined) {
      continue;
    }
    const previousIndex = lastIndexByBatchId.get(grant.sequenceBatchId);
    if (previousIndex !== undefined && grant.sequenceIndex < previousIndex) {
      invalidGrantArrayOperation(
        'insertGrantBatch',
        `sequence batch "${grant.sequenceBatchId}" is out of order (${grant.sequenceIndex} after ${previousIndex})`,
      );
    }
    lastIndexByBatchId.set(grant.sequenceBatchId, grant.sequenceIndex);
  }
};

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

export const insertGrant = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  grant: TurnFlowPendingFreeOperationGrant,
): GrantArrayResult => {
  assertNoDuplicateGrantIds('insertGrant', [...grants, grant]);
  return {
    grants: [...grants, grant],
    trace: [],
  };
};

export const insertGrantBatch = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  batch: readonly TurnFlowPendingFreeOperationGrant[],
): GrantArrayResult => {
  assertSequenceOrdering(batch);
  const nextGrants = [...grants, ...batch];
  assertNoDuplicateGrantIds('insertGrantBatch', nextGrants);
  return {
    grants: nextGrants,
    trace: [],
  };
};

export const consumeGrantUse = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  grantId: string,
): GrantArrayConsumeResult => {
  const grantIndex = grants.findIndex((grant) => grant.grantId === grantId);
  if (grantIndex < 0) {
    invalidGrantArrayOperation(
      'consumeGrantUse',
      `unknown grantId "${grantId}"`,
    );
  }

  const grant = grants[grantIndex];
  if (grant === undefined) {
    invalidGrantArrayOperation(
      'consumeGrantUse',
      `grant lookup for "${grantId}" resolved to an invalid index`,
    );
  }

  const transitioned = consumeUse(grant!);
  const wasExhausted = transitioned.grant.remainingUses === 0;
  return {
    grants: wasExhausted
      ? [
          ...grants.slice(0, grantIndex),
          ...grants.slice(grantIndex + 1),
        ]
      : [
          ...grants.slice(0, grantIndex),
          transitioned.grant,
          ...grants.slice(grantIndex + 1),
        ],
    trace: [transitioned.traceEntry],
    consumed: transitioned.grant,
    wasExhausted,
  };
};

export const expireGrantsForSeat = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  seat: string,
): GrantArrayResult => {
  const nextGrants: TurnFlowPendingFreeOperationGrant[] = [];
  const trace: TurnFlowGrantLifecycleTraceEntry[] = [];
  for (const grant of grants) {
    if (grant.seat !== seat || (grant.phase !== 'ready' && grant.phase !== 'offered')) {
      nextGrants.push(grant);
      continue;
    }
    const transitioned = expireGrant(grant);
    trace.push(transitioned.traceEntry);
  }
  return {
    grants: nextGrants,
    trace,
  };
};

export const expireReadyBlockingGrantsForSeat = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  seat: string,
): GrantArrayResult => {
  const nextGrants: TurnFlowPendingFreeOperationGrant[] = [];
  const trace: TurnFlowGrantLifecycleTraceEntry[] = [];
  for (const grant of grants) {
    if (
      grant.seat !== seat
      || grant.phase !== 'ready'
      || (
        grant.completionPolicy !== 'required'
        && grant.completionPolicy !== 'skipIfNoLegalCompletion'
      )
    ) {
      nextGrants.push(grant);
      continue;
    }
    const transitioned = expireGrant(grant);
    trace.push(transitioned.traceEntry);
  }
  return {
    grants: nextGrants,
    trace,
  };
};

/**
 * Skip only `skipIfNoLegalCompletion` grants for the given seat.
 * Used as a fallback when the agent cannot derive a playable move from
 * template completion despite legal moves existing — the grant's zone
 * filter or constraint makes it effectively uncompletable for the agent.
 */
export const skipReadySkippableGrantsForSeat = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  seat: string,
): GrantArrayResult => {
  const nextGrants: TurnFlowPendingFreeOperationGrant[] = [];
  const trace: TurnFlowGrantLifecycleTraceEntry[] = [];
  for (const grant of grants) {
    if (
      grant.seat !== seat
      || grant.phase !== 'ready'
      || grant.completionPolicy !== 'skipIfNoLegalCompletion'
    ) {
      nextGrants.push(grant);
      continue;
    }
    const transitioned = skipGrant(grant);
    trace.push(transitioned.traceEntry);
  }
  return {
    grants: nextGrants,
    trace,
  };
};

export const advanceSequenceGrants = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  readySequenceBatchIds: ReadonlySet<string>,
): GrantArrayResult => {
  const trace: TurnFlowGrantLifecycleTraceEntry[] = [];
  return {
    grants: grants.map((grant) => {
      if (
        grant.phase !== 'sequenceWaiting'
        || grant.sequenceBatchId === undefined
        || !readySequenceBatchIds.has(grant.sequenceBatchId)
      ) {
        return grant;
      }
      const transitioned = advanceToReady(grant);
      trace.push(transitioned.traceEntry);
      return transitioned.grant;
    }),
    trace,
  };
};

export const createProbeOverlay = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  probeGrants: readonly TurnFlowPendingFreeOperationGrant[],
): readonly TurnFlowPendingFreeOperationGrant[] => [
  ...grants,
  ...probeGrants,
];

export const stripZoneFilterFromProbeGrant = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  grantId: string,
): readonly TurnFlowPendingFreeOperationGrant[] => grants.map((grant) => {
  if (grant.grantId !== grantId || grant.zoneFilter === undefined) {
    return grant;
  }
  const grantWithoutZoneFilter = { ...grant };
  delete grantWithoutZoneFilter.zoneFilter;
  return grantWithoutZoneFilter;
});

export const withPendingFreeOperationGrants = (
  runtime: TurnFlowRuntimeState,
  grants: readonly TurnFlowPendingFreeOperationGrant[] | undefined,
): TurnFlowRuntimeState => {
  const nextRuntime = {
    ...runtime,
    ...(grants === undefined ? {} : { pendingFreeOperationGrants: grants }),
  };
  if (grants === undefined) {
    delete (nextRuntime as { pendingFreeOperationGrants?: readonly TurnFlowPendingFreeOperationGrant[] }).pendingFreeOperationGrants;
  }
  return nextRuntime;
};

export const transitionReadyGrantForCandidateMove = (
  def: GameDef,
  state: GameState,
  grant: TurnFlowPendingFreeOperationGrant,
  baseMove: Move,
  seatResolution: SeatResolutionContext,
  options?: {
    readonly budgets?: Partial<MoveEnumerationBudgets>;
    readonly onWarning?: (warning: RuntimeWarning) => void;
    readonly resolveDecisionSequence?: (
      move: Move,
      options?: {
        readonly budgets?: Partial<MoveEnumerationBudgets>;
        readonly onWarning?: (warning: RuntimeWarning) => void;
      },
    ) => ResolveMoveDecisionSequenceResult;
  },
): GrantLifecycleTransitionResult => {
  assertPhase('transitionReadyGrantForCandidateMove', grant, ['ready']);
  if (
    grant.completionPolicy === 'skipIfNoLegalCompletion'
    && !hasLegalCompletedFreeOperationMoveInCurrentState(def, state, baseMove, seatResolution, options)
  ) {
    return skipGrant(grant);
  }
  return markOffered(grant);
};
