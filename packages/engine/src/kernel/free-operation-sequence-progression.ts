import type {
  TurnFlowPendingFreeOperationGrant,
  TurnFlowFreeOperationGrantContract,
  TurnFlowFreeOperationGrantProgressionPolicy,
  TurnFlowRuntimeState,
} from './types.js';

export interface PendingFreeOperationGrantSequenceStatus {
  readonly progressionPolicy: TurnFlowFreeOperationGrantProgressionPolicy;
  readonly ready: boolean;
  readonly blockingGrantIds: readonly string[];
  readonly satisfiedEarlierStepIndices: readonly number[];
  readonly skippedEarlierStepIndices: readonly number[];
}

export const resolveSequenceProgressionPolicy = (
  grant: Pick<TurnFlowFreeOperationGrantContract, 'sequence'>,
): TurnFlowFreeOperationGrantProgressionPolicy =>
  (grant.sequence?.progressionPolicy ?? 'strictInOrder');

export const ensureFreeOperationSequenceBatchContext = (
  contexts: TurnFlowRuntimeState['freeOperationSequenceContexts'] | undefined,
  batchId: string,
  progressionPolicy: TurnFlowFreeOperationGrantProgressionPolicy,
): TurnFlowRuntimeState['freeOperationSequenceContexts'] => ({
  ...(contexts ?? {}),
  [batchId]: {
    capturedMoveZonesByKey: contexts?.[batchId]?.capturedMoveZonesByKey ?? {},
    progressionPolicy,
    skippedStepIndices: contexts?.[batchId]?.skippedStepIndices ?? [],
  },
});

export const appendSkippedSequenceStep = (
  contexts: TurnFlowRuntimeState['freeOperationSequenceContexts'] | undefined,
  batchId: string,
  progressionPolicy: TurnFlowFreeOperationGrantProgressionPolicy,
  step: number,
): TurnFlowRuntimeState['freeOperationSequenceContexts'] => {
  const nextContexts = ensureFreeOperationSequenceBatchContext(contexts, batchId, progressionPolicy)!;
  const current = nextContexts[batchId]!;
  if (current.skippedStepIndices.includes(step)) {
    return nextContexts;
  }
  return {
    ...nextContexts,
    [batchId]: {
      ...current,
      skippedStepIndices: [...current.skippedStepIndices, step].sort((left, right) => left - right),
    },
  };
};

export const isSequenceStepSkipped = (
  contexts: TurnFlowRuntimeState['freeOperationSequenceContexts'] | undefined,
  batchId: string,
  step: number,
): boolean => contexts?.[batchId]?.skippedStepIndices.includes(step) ?? false;

export const resolvePendingFreeOperationGrantSequenceStatus = (
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  grant: Pick<TurnFlowPendingFreeOperationGrant, 'grantId' | 'sequenceBatchId' | 'sequenceIndex'>,
  sequenceContexts?: TurnFlowRuntimeState['freeOperationSequenceContexts'],
): PendingFreeOperationGrantSequenceStatus => {
  const batchId = grant.sequenceBatchId;
  const sequenceIndex = grant.sequenceIndex;
  if (batchId === undefined || sequenceIndex === undefined) {
    return {
      progressionPolicy: 'strictInOrder',
      ready: true,
      blockingGrantIds: [],
      satisfiedEarlierStepIndices: [],
      skippedEarlierStepIndices: [],
    };
  }

  const progressionPolicy = sequenceContexts?.[batchId]?.progressionPolicy ?? 'strictInOrder';
  const skippedEarlierStepIndices = (sequenceContexts?.[batchId]?.skippedStepIndices ?? [])
    .filter((step) => step < sequenceIndex)
    .sort((left, right) => left - right);
  const pendingEarlierGrants = pending.filter(
    (candidate) =>
      candidate.grantId !== grant.grantId &&
      candidate.sequenceBatchId === batchId &&
      (candidate.sequenceIndex ?? Number.POSITIVE_INFINITY) < sequenceIndex,
  );
  const blockingGrantIds = pendingEarlierGrants.map((candidate) => candidate.grantId);
  const blockingStepIndices = new Set(
    pendingEarlierGrants
      .map((candidate) => candidate.sequenceIndex)
      .filter((step): step is number => step !== undefined),
  );
  const skippedStepIndices = new Set(skippedEarlierStepIndices);
  const satisfiedEarlierStepIndices: number[] = [];
  for (let step = 0; step < sequenceIndex; step += 1) {
    if (!blockingStepIndices.has(step) || skippedStepIndices.has(step)) {
      satisfiedEarlierStepIndices.push(step);
    }
  }

  return {
    progressionPolicy,
    ready: blockingGrantIds.length === 0,
    blockingGrantIds,
    satisfiedEarlierStepIndices,
    skippedEarlierStepIndices,
  };
};
