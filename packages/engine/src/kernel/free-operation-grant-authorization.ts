import { asZoneId } from './branded.js';
import { isTurnFlowActionClass } from '../contracts/index.js';
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

const moveZoneCandidates = (def: GameDef, move: Move): readonly string[] => {
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
  const zones = moveZoneCandidates(def, move);
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
  (
    grant.zoneFilter === undefined
    || evaluateZoneFilterForMove(def, state, move, grant.zoneFilter, 'turnFlowEligibility')
  );
