import type {
  TurnFlowFreeOperationGrantContract,
  TurnFlowFreeOperationGrantProgressionPolicy,
  TurnFlowRuntimeState,
} from './types.js';

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
