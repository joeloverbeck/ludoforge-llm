import type {
  TurnFlowFreeOperationGrantContract,
  TurnFlowPendingFreeOperationGrant,
} from './types.js';

interface BuildPendingFreeOperationGrantOptions {
  readonly grantId: string;
  readonly seat: TurnFlowPendingFreeOperationGrant['seat'];
  readonly executeAsSeat?: TurnFlowPendingFreeOperationGrant['executeAsSeat'];
  readonly zoneFilter?: TurnFlowPendingFreeOperationGrant['zoneFilter'];
  readonly executionContext?: TurnFlowPendingFreeOperationGrant['executionContext'];
  readonly remainingUses?: TurnFlowPendingFreeOperationGrant['remainingUses'];
  readonly sequenceBatchId?: TurnFlowPendingFreeOperationGrant['sequenceBatchId'];
  readonly sequenceIndex?: TurnFlowPendingFreeOperationGrant['sequenceIndex'];
}

export const buildPendingFreeOperationGrant = (
  grant: TurnFlowFreeOperationGrantContract,
  options: BuildPendingFreeOperationGrantOptions,
): TurnFlowPendingFreeOperationGrant => {
  const sequenceIndex = options.sequenceIndex ?? grant.sequence?.step;
  const remainingUses = options.remainingUses ?? grant.uses ?? 1;
  const zoneFilter = options.zoneFilter ?? grant.zoneFilter;

  return {
    grantId: options.grantId,
    phase: sequenceIndex === undefined || sequenceIndex === 0 ? 'ready' : 'sequenceWaiting',
    seat: options.seat,
    ...(options.executeAsSeat === undefined ? {} : { executeAsSeat: options.executeAsSeat }),
    operationClass: grant.operationClass,
    ...(grant.actionIds === undefined ? {} : { actionIds: [...grant.actionIds] }),
    ...(zoneFilter === undefined ? {} : { zoneFilter }),
    ...(grant.tokenInterpretations === undefined ? {} : { tokenInterpretations: grant.tokenInterpretations }),
    ...(grant.moveZoneBindings === undefined ? {} : { moveZoneBindings: [...grant.moveZoneBindings] }),
    ...(grant.moveZoneProbeBindings === undefined ? {} : { moveZoneProbeBindings: [...grant.moveZoneProbeBindings] }),
    ...(grant.sequenceContext === undefined ? {} : { sequenceContext: grant.sequenceContext }),
    ...(options.executionContext === undefined ? {} : { executionContext: options.executionContext }),
    ...(grant.allowDuringMonsoon === undefined ? {} : { allowDuringMonsoon: grant.allowDuringMonsoon }),
    ...(grant.viabilityPolicy === undefined ? {} : { viabilityPolicy: grant.viabilityPolicy }),
    ...(grant.completionPolicy === undefined ? {} : { completionPolicy: grant.completionPolicy }),
    ...(grant.outcomePolicy === undefined ? {} : { outcomePolicy: grant.outcomePolicy }),
    ...(grant.postResolutionTurnFlow === undefined ? {} : { postResolutionTurnFlow: grant.postResolutionTurnFlow }),
    remainingUses,
    ...(options.sequenceBatchId === undefined ? {} : { sequenceBatchId: options.sequenceBatchId }),
    ...(sequenceIndex === undefined ? {} : { sequenceIndex }),
  };
};
