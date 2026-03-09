import { resolveGrantFreeOperationActionDomain } from './free-operation-action-domain.js';
import type { EventFreeOperationGrantDef } from './types-events.js';
import type { GameDef, GameState, TurnFlowPendingFreeOperationGrant } from './types.js';

type FreeOperationGrantOverlapComparable = {
  readonly seat: string;
  readonly executeAsSeat?: string;
  readonly operationClass: string;
  readonly zoneFilter?: unknown;
  readonly allowDuringMonsoon?: boolean;
  readonly viabilityPolicy?: string;
  readonly completionPolicy?: string;
  readonly outcomePolicy?: string;
  readonly postResolutionTurnFlow?: string;
  readonly sequenceContext?: unknown;
};

type FreeOperationGrantClassificationOptions = {
  readonly additionalFields?: Readonly<Record<string, unknown>>;
};

const withOptional = (
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void => {
  if (value !== undefined) {
    target[key] = value;
  }
};

const createOverlapSurface = (
  grant: FreeOperationGrantOverlapComparable,
  actionIds: readonly string[],
): Readonly<Record<string, unknown>> => {
  const surface: Record<string, unknown> = {
    seat: grant.seat,
    operationClass: grant.operationClass,
    actionIds: [...actionIds].sort(),
  };
  withOptional(surface, 'executeAsSeat', grant.executeAsSeat);
  withOptional(surface, 'zoneFilter', grant.zoneFilter);
  withOptional(surface, 'allowDuringMonsoon', grant.allowDuringMonsoon);
  withOptional(surface, 'viabilityPolicy', grant.viabilityPolicy);
  withOptional(surface, 'sequenceContext', grant.sequenceContext);
  return surface;
};

export const freeOperationGrantOverlapSurfaceKey = (
  grant: FreeOperationGrantOverlapComparable,
  actionIds: readonly string[],
): string => JSON.stringify(createOverlapSurface(grant, actionIds));

export const freeOperationGrantEquivalenceKey = (
  grant: FreeOperationGrantOverlapComparable,
  actionIds: readonly string[],
  options?: FreeOperationGrantClassificationOptions,
): string => {
  const surface = {
    ...createOverlapSurface(grant, actionIds),
  };
  withOptional(surface, 'completionPolicy', grant.completionPolicy);
  withOptional(surface, 'outcomePolicy', grant.outcomePolicy);
  withOptional(surface, 'postResolutionTurnFlow', grant.postResolutionTurnFlow);
  if (options?.additionalFields !== undefined) {
    Object.assign(surface, options.additionalFields);
  }
  return JSON.stringify(surface);
};

const grantHasSequenceBatchScopedSemantics = (
  state: GameState,
  grant: TurnFlowPendingFreeOperationGrant,
): boolean => {
  if (state.turnOrderState.type !== 'cardDriven') {
    return false;
  }
  const batchId = grant.sequenceBatchId;
  if (batchId === undefined) {
    return false;
  }
  return grant.sequenceContext !== undefined || state.turnOrderState.runtime.freeOperationSequenceContexts?.[batchId] !== undefined;
};

const grantDeferredDependencyProfile = (
  state: GameState,
  grant: TurnFlowPendingFreeOperationGrant,
): readonly string[] => {
  const batchId = grant.sequenceBatchId;
  if (state.turnOrderState.type !== 'cardDriven' || batchId === undefined) {
    return [];
  }
  return (state.turnOrderState.runtime.pendingDeferredEventEffects ?? [])
    .filter((deferred) => deferred.requiredGrantBatchIds.includes(batchId))
    .map((deferred) => deferred.deferredId)
    .sort();
};

export const eventFreeOperationGrantOverlapSurfaceKey = (
  def: GameDef,
  grant: EventFreeOperationGrantDef,
): string => freeOperationGrantOverlapSurfaceKey(
  grant,
  resolveGrantFreeOperationActionDomain(def, grant),
);

export const eventFreeOperationGrantEquivalenceKey = (
  def: GameDef,
  grant: EventFreeOperationGrantDef,
): string => freeOperationGrantEquivalenceKey(
  grant,
  resolveGrantFreeOperationActionDomain(def, grant),
  {
    additionalFields: {
      uses: grant.uses ?? 1,
      ...(grant.sequenceContext === undefined ? {} : { sequence: grant.sequence }),
    },
  },
);

export const pendingFreeOperationGrantEquivalenceKey = (
  def: GameDef,
  state: GameState,
  grant: TurnFlowPendingFreeOperationGrant,
): string => freeOperationGrantEquivalenceKey(
  grant,
  resolveGrantFreeOperationActionDomain(def, grant),
  {
    additionalFields: {
      remainingUses: grant.remainingUses,
      deferredDependencyProfile: grantDeferredDependencyProfile(state, grant),
      ...(grantHasSequenceBatchScopedSemantics(state, grant)
        ? {
            sequenceBatchId: grant.sequenceBatchId,
            sequenceIndex: grant.sequenceIndex,
          }
        : {}),
    },
  },
);
