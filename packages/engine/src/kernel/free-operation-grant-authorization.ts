import { asZoneId } from './branded.js';
import { compareTurnFlowFreeOperationGrantPriority, isTurnFlowActionClass } from '../contracts/index.js';
import { createCollector } from './execution-collector.js';
import { evalCondition } from './eval-condition.js';
import { createEvalContext, createEvalRuntimeResources } from './eval-context.js';
import { resolveGrantFreeOperationActionDomain } from './free-operation-action-domain.js';
import { resolveTurnFlowActionClass } from './turn-flow-action-class.js';
import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';
import {
  collectFreeOperationZoneFilterProbeRebindableAliases,
  evaluateFreeOperationZoneFilterProbe,
} from './free-operation-zone-filter-probe.js';
import { buildMoveRuntimeBindings } from './move-runtime-bindings.js';
import { shouldDeferFreeOperationZoneFilterFailure } from './missing-binding-policy.js';
import { kernelRuntimeError } from './runtime-error.js';
import { buildAdjacencyGraph } from './spatial.js';
import { freeOperationZoneFilterEvaluationError } from './turn-flow-error.js';
import type {
  ConditionAST,
  GameDef,
  GameState,
  Move,
  TurnFlowPendingFreeOperationGrant,
} from './types.js';

export const grantActionIds = (
  def: GameDef,
  grant: TurnFlowPendingFreeOperationGrant,
): readonly string[] => resolveGrantFreeOperationActionDomain(def, grant);

export const moveOperationClass = (
  def: GameDef,
  move: Move,
): TurnFlowPendingFreeOperationGrant['operationClass'] => {
  const resolved = resolveTurnFlowActionClass(def, move);
  if (resolved !== null) {
    if (
      move.actionClass !== undefined &&
      move.actionClass !== resolved &&
      isTurnFlowActionClass(move.actionClass)
    ) {
      if (
        resolved === 'operation' &&
        (move.actionClass === 'limitedOperation' || move.actionClass === 'operationPlusSpecialActivity')
      ) {
        return move.actionClass;
      }
      if (resolved === 'specialActivity' && move.actionClass === 'operationPlusSpecialActivity') {
        return move.actionClass;
      }
    }
    return resolved;
  }
  return 'operation';
};

export const isPendingFreeOperationGrantSequenceReady = (
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  grant: TurnFlowPendingFreeOperationGrant,
): boolean => {
  const batchId = grant.sequenceBatchId;
  const sequenceIndex = grant.sequenceIndex;
  if (batchId === undefined || sequenceIndex === undefined) {
    return true;
  }
  return !pending.some(
    (candidate) =>
      candidate.grantId !== grant.grantId &&
      candidate.sequenceBatchId === batchId &&
      (candidate.sequenceIndex ?? Number.POSITIVE_INFINITY) < sequenceIndex,
  );
};

export const isGrantOperationClassCompatible = (
  grantClass: TurnFlowPendingFreeOperationGrant['operationClass'],
  moveClass: TurnFlowPendingFreeOperationGrant['operationClass'],
): boolean => {
  if (grantClass === moveClass) {
    return true;
  }
  if (grantClass === 'operation' && moveClass === 'specialActivity') {
    return true;
  }
  return false;
};

const doesGrantApplyToMove = (
  def: GameDef,
  grant: TurnFlowPendingFreeOperationGrant,
  move: Move,
): boolean =>
  isGrantOperationClassCompatible(grant.operationClass, moveOperationClass(def, move)) &&
  grantActionIds(def, grant).includes(String(move.actionId));

export const collectMoveZoneCandidates = (def: GameDef, move: Move): readonly string[] => {
  const zoneIdSet = new Set(def.zones.map((zone) => String(zone.id)));
  const candidates = new Set<string>();
  for (const paramValue of Object.values(move.params)) {
    if (typeof paramValue === 'string' && zoneIdSet.has(paramValue)) {
      candidates.add(paramValue);
      continue;
    }
    if (Array.isArray(paramValue)) {
      for (const item of paramValue) {
        if (typeof item === 'string' && zoneIdSet.has(item)) {
          candidates.add(item);
        }
      }
    }
  }
  return [...candidates];
};

const doesGrantSatisfySequenceContext = (
  def: GameDef,
  state: GameState,
  grant: TurnFlowPendingFreeOperationGrant,
  move: Move,
  options?: {
    readonly allowUnresolvedMoveZones?: boolean;
  },
): boolean => {
  const contextKey = grant.sequenceContext?.requireMoveZoneCandidatesFrom;
  if (contextKey === undefined) {
    return true;
  }
  if (state.turnOrderState.type !== 'cardDriven') {
    return false;
  }
  const batchId = grant.sequenceBatchId;
  if (batchId === undefined) {
    return false;
  }
  const captured = state.turnOrderState.runtime.freeOperationSequenceContexts?.[batchId]?.capturedMoveZonesByKey?.[contextKey];
  if (captured === undefined || captured.length === 0) {
    return false;
  }
  const moveZones = collectMoveZoneCandidates(def, move);
  if (moveZones.length === 0) {
    return options?.allowUnresolvedMoveZones === true;
  }
  const capturedSet = new Set(captured);
  return moveZones.some((zoneId) => capturedSet.has(zoneId));
};

export const evaluateZoneFilterForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  zoneFilter: ConditionAST,
  surface: FreeOperationZoneFilterSurface,
): boolean => {
  const shouldDeferZoneFilterFailure = (cause: unknown): boolean =>
    shouldDeferFreeOperationZoneFilterFailure(surface, cause);
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const baseBindings: Readonly<Record<string, unknown>> = buildMoveRuntimeBindings(move);
  const rebindableAliases = collectFreeOperationZoneFilterProbeRebindableAliases(zoneFilter);
  const zones = collectMoveZoneCandidates(def, move);
  if (zones.length === 0) {
    try {
      return evalCondition(zoneFilter, createEvalContext({
        def,
        adjacencyGraph,
        state,
        activePlayer: state.activePlayer,
        actorPlayer: state.activePlayer,
        bindings: baseBindings,
        resources: createEvalRuntimeResources({ collector: createCollector() }),
      }));
    } catch (cause) {
      if (shouldDeferZoneFilterFailure(cause)) {
        return true;
      }
      throw freeOperationZoneFilterEvaluationError({
        surface,
        actionId: String(move.actionId),
        moveParams: move.params,
        zoneFilter,
        candidateZones: zones,
        cause,
      });
    }
  }
  for (const zone of zones) {
    try {
      if (evaluateFreeOperationZoneFilterProbe({
        zoneId: asZoneId(zone),
        baseBindings,
        rebindableAliases,
        evaluateWithBindings: (bindings) => evalCondition(zoneFilter, createEvalContext({
          def,
          adjacencyGraph,
          state,
          activePlayer: state.activePlayer,
          actorPlayer: state.activePlayer,
          bindings,
          resources: createEvalRuntimeResources({ collector: createCollector() }),
        })),
      })) {
        return true;
      }
    } catch (cause) {
      if (shouldDeferZoneFilterFailure(cause)) {
        return true;
      }
      throw freeOperationZoneFilterEvaluationError({
        surface,
        actionId: String(move.actionId),
        moveParams: move.params,
        zoneFilter,
        candidateZones: zones,
        candidateZone: zone,
        cause,
      });
    }
  }
  return false;
};

export const doesGrantAuthorizeMove = (
  def: GameDef,
  state: GameState,
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  grant: TurnFlowPendingFreeOperationGrant,
  move: Move,
): boolean =>
  isPendingFreeOperationGrantSequenceReady(pending, grant) &&
  doesGrantApplyToMove(def, grant, move) &&
  doesGrantSatisfySequenceContext(def, state, grant, move) &&
  (
    grant.zoneFilter === undefined
    || evaluateZoneFilterForMove(def, state, move, grant.zoneFilter, 'turnFlowEligibility')
  );

export const doesGrantRequireSequenceContextMatch = doesGrantSatisfySequenceContext;

const compareAuthorizedPendingFreeOperationGrantPriority = (
  left: TurnFlowPendingFreeOperationGrant,
  right: TurnFlowPendingFreeOperationGrant,
): number => compareTurnFlowFreeOperationGrantPriority(left, right);

const normalizedGrantActionIds = (
  def: GameDef,
  grant: TurnFlowPendingFreeOperationGrant,
): readonly string[] => [...grantActionIds(def, grant)].sort();

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
  if (state.turnOrderState.type !== 'cardDriven' || grant.sequenceBatchId === undefined) {
    return [];
  }
  return (state.turnOrderState.runtime.pendingDeferredEventEffects ?? [])
    .filter((deferred) => deferred.requiredGrantBatchIds.includes(grant.sequenceBatchId!))
    .map((deferred) => deferred.deferredId)
    .sort();
};

const authorizedPendingFreeOperationGrantEquivalenceKey = (
  def: GameDef,
  state: GameState,
  grant: TurnFlowPendingFreeOperationGrant,
): string => JSON.stringify({
  seat: grant.seat,
  executeAsSeat: grant.executeAsSeat,
  operationClass: grant.operationClass,
  actionIds: normalizedGrantActionIds(def, grant),
  zoneFilter: grant.zoneFilter,
  allowDuringMonsoon: grant.allowDuringMonsoon,
  viabilityPolicy: grant.viabilityPolicy,
  completionPolicy: grant.completionPolicy,
  outcomePolicy: grant.outcomePolicy,
  postResolutionTurnFlow: grant.postResolutionTurnFlow,
  remainingUses: grant.remainingUses,
  sequenceContext: grant.sequenceContext,
  deferredDependencyProfile: grantDeferredDependencyProfile(state, grant),
  ...(grantHasSequenceBatchScopedSemantics(state, grant)
    ? {
        sequenceBatchId: grant.sequenceBatchId,
        sequenceIndex: grant.sequenceIndex,
      }
    : {}),
});

const assertNoAmbiguousAuthorizedPendingFreeOperationGrantOverlap = (
  def: GameDef,
  state: GameState,
  matchingGrants: readonly TurnFlowPendingFreeOperationGrant[],
  move: Move,
): void => {
  if (matchingGrants.length <= 1) {
    return;
  }
  const canonicalGrant = selectCanonicalPendingFreeOperationGrant(matchingGrants);
  if (canonicalGrant === null) {
    return;
  }
  const strongestMatches = matchingGrants.filter(
    (grant) => compareAuthorizedPendingFreeOperationGrantPriority(canonicalGrant, grant) === 0,
  );
  if (strongestMatches.length <= 1) {
    return;
  }
  const equivalenceKeys = new Set(
    strongestMatches.map((grant) => authorizedPendingFreeOperationGrantEquivalenceKey(def, state, grant)),
  );
  if (equivalenceKeys.size <= 1) {
    return;
  }
  throw kernelRuntimeError(
    'RUNTIME_CONTRACT_INVALID',
    `Ambiguous overlapping free-operation grants matched actionId=${String(move.actionId)}; top-ranked grants must be equivalent or strictly ordered by contract.`,
  );
};

const selectCanonicalPendingFreeOperationGrant = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
): TurnFlowPendingFreeOperationGrant | null =>
  grants.reduce<TurnFlowPendingFreeOperationGrant | null>((selected, grant) => {
    if (selected === null) {
      return grant;
    }
    return compareAuthorizedPendingFreeOperationGrantPriority(selected, grant) <= 0
      ? selected
      : grant;
  }, null);

export interface AuthorizedPendingFreeOperationGrantResolution {
  readonly matchingGrants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly canonicalGrant: TurnFlowPendingFreeOperationGrant | null;
  readonly strongestOutcomeGrant: TurnFlowPendingFreeOperationGrant | null;
}

export const resolveAuthorizedPendingFreeOperationGrants = (
  def: GameDef,
  state: GameState,
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  activeSeat: string,
  move: Move,
): AuthorizedPendingFreeOperationGrantResolution => {
  const matchingGrants = pending.filter(
    (grant) => grant.seat === activeSeat && doesGrantAuthorizeMove(def, state, pending, grant, move),
  );
  assertNoAmbiguousAuthorizedPendingFreeOperationGrantOverlap(def, state, matchingGrants, move);
  const canonicalGrant = selectCanonicalPendingFreeOperationGrant(matchingGrants);
  const strongestOutcomeGrant = selectCanonicalPendingFreeOperationGrant(
    matchingGrants.filter((grant) => grant.outcomePolicy === 'mustChangeGameplayState'),
  );
  return {
    matchingGrants,
    canonicalGrant,
    strongestOutcomeGrant,
  };
};
