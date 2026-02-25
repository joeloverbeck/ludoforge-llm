import type { TurnFlowDeferredEventLifecycleTraceEntry } from './types.js';

type DeferredLifecycleMetadata = Pick<
  TurnFlowDeferredEventLifecycleTraceEntry,
  'deferredId' | 'actionId' | 'requiredGrantBatchIds'
>;

export const createDeferredLifecycleTraceEntry = (
  stage: TurnFlowDeferredEventLifecycleTraceEntry['stage'],
  metadata: DeferredLifecycleMetadata,
): TurnFlowDeferredEventLifecycleTraceEntry => ({
  kind: 'turnFlowDeferredEventLifecycle',
  stage,
  deferredId: metadata.deferredId,
  actionId: metadata.actionId,
  requiredGrantBatchIds: metadata.requiredGrantBatchIds,
});
