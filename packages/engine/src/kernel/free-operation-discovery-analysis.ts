import { asPlayerId, asZoneId } from './branded.js';
import { isTurnFlowActionClass } from '../contracts/index.js';
import { createCollector } from './execution-collector.js';
import { evalCondition } from './eval-condition.js';
import { createEvalContext, createEvalRuntimeResources } from './eval-context.js';
import { resolveGrantFreeOperationActionDomain } from './free-operation-action-domain.js';
import { resolveTurnFlowActionClass, type ResolvedTurnFlowActionClass } from './turn-flow-action-class.js';
import type { FreeOperationBlockExplanation } from './free-operation-denial-contract.js';
import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';
import {
  collectFreeOperationZoneFilterProbeRebindableAliases,
  evaluateFreeOperationZoneFilterProbe,
} from './free-operation-zone-filter-probe.js';
import { buildMoveRuntimeBindings } from './move-runtime-bindings.js';
import { shouldDeferFreeOperationZoneFilterFailure } from './missing-binding-policy.js';
import { resolvePlayerIndexForTurnFlowSeat, type SeatResolutionContext } from './seat-resolution.js';
import { buildAdjacencyGraph } from './spatial.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS } from './turn-flow-active-seat-invariant-surfaces.js';
import { freeOperationZoneFilterEvaluationError } from './turn-flow-error.js';
import { requireCardDrivenActiveSeat } from './turn-flow-runtime-invariants.js';
import type {
  ConditionAST,
  GameDef,
  GameState,
  Move,
  TurnFlowPendingFreeOperationGrant,
} from './types.js';

interface FreeOperationGrantAnalysis {
  readonly activeSeat: string;
  readonly actionClass: ResolvedTurnFlowActionClass;
  readonly actionId: string;
  readonly pending: readonly TurnFlowPendingFreeOperationGrant[];
  readonly activeGrants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly sequenceReadyGrants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly actionClassMatchedGrants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly actionMatchedGrants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly zoneMatchedGrants: readonly TurnFlowPendingFreeOperationGrant[];
}

const grantActionIds = (
  def: GameDef,
  grant: TurnFlowPendingFreeOperationGrant,
): readonly string[] => resolveGrantFreeOperationActionDomain(def, grant);

const moveOperationClass = (
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

const isPendingFreeOperationGrantSequenceReady = (
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

const isGrantOperationClassCompatible = (
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

const evaluateZoneFilterForMove = (
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

const analyzeFreeOperationGrantMatch = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
  options?: {
    readonly evaluateZoneFilters?: boolean;
    readonly zoneFilterErrorSurface?: FreeOperationZoneFilterSurface;
  },
): FreeOperationGrantAnalysis | null => {
  if (move.freeOperation !== true || state.turnOrderState.type !== 'cardDriven') {
    return null;
  }
  const activeSeat = requireCardDrivenActiveSeat(
    def,
    state,
    TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_MATCH_EVALUATION,
    seatResolution,
  );
  const actionClass = moveOperationClass(def, move);
  const actionId = String(move.actionId);
  const pending = state.turnOrderState.runtime.pendingFreeOperationGrants ?? [];
  const activeGrants = pending.filter((grant) => grant.seat === activeSeat);
  const sequenceReadyGrants = activeGrants.filter((grant) => isPendingFreeOperationGrantSequenceReady(pending, grant));
  const actionClassMatchedGrants = sequenceReadyGrants.filter((grant) => isGrantOperationClassCompatible(grant.operationClass, actionClass));
  const actionMatchedGrants = actionClassMatchedGrants.filter((grant) => grantActionIds(def, grant).includes(actionId));
  const zoneMatchedGrants = options?.evaluateZoneFilters === true
    ? actionMatchedGrants.filter(
        (grant) => grant.zoneFilter === undefined || evaluateZoneFilterForMove(
          def,
          state,
          move,
          grant.zoneFilter,
          options.zoneFilterErrorSurface ?? 'turnFlowEligibility',
        ),
      )
    : actionMatchedGrants;
  return {
    activeSeat,
    actionClass,
    actionId,
    pending,
    activeGrants,
    sequenceReadyGrants,
    actionClassMatchedGrants,
    actionMatchedGrants,
    zoneMatchedGrants,
  };
};

const sequenceBlockingGrantIds = (
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  grant: TurnFlowPendingFreeOperationGrant,
): readonly string[] => {
  const batchId = grant.sequenceBatchId;
  const sequenceIndex = grant.sequenceIndex;
  if (batchId === undefined || sequenceIndex === undefined) {
    return [];
  }
  return pending
    .filter(
      (candidate) =>
        candidate.grantId !== grant.grantId &&
        candidate.sequenceBatchId === batchId &&
        (candidate.sequenceIndex ?? Number.POSITIVE_INFINITY) < sequenceIndex,
    )
    .map((candidate) => candidate.grantId);
};

const explainFreeOperationBlockFromAnalysis = (
  analysis: FreeOperationGrantAnalysis,
): FreeOperationBlockExplanation => {
  const {
    activeSeat,
    actionClass,
    actionId,
    pending,
    activeGrants,
    sequenceReadyGrants,
    actionClassMatchedGrants,
    actionMatchedGrants,
    zoneMatchedGrants,
  } = analysis;

  if (activeGrants.length === 0) {
    return { cause: 'noActiveSeatGrant', activeSeat };
  }

  if (sequenceReadyGrants.length === 0) {
    const blockers = new Set<string>();
    for (const grant of activeGrants) {
      for (const blocker of sequenceBlockingGrantIds(pending, grant)) {
        blockers.add(blocker);
      }
    }
    return {
      cause: 'sequenceLocked',
      activeSeat,
      matchingGrantIds: activeGrants.map((grant) => grant.grantId),
      sequenceLockBlockingGrantIds: [...blockers],
    };
  }

  if (actionClassMatchedGrants.length === 0) {
    return {
      cause: 'actionClassMismatch',
      activeSeat,
      actionClass,
      actionId,
      matchingGrantIds: sequenceReadyGrants.map((grant) => grant.grantId),
    };
  }

  if (actionMatchedGrants.length === 0) {
    return {
      cause: 'actionIdMismatch',
      activeSeat,
      actionClass,
      actionId,
      matchingGrantIds: actionClassMatchedGrants.map((grant) => grant.grantId),
    };
  }

  if (zoneMatchedGrants.length === 0) {
    return {
      cause: 'zoneFilterMismatch',
      activeSeat,
      actionClass,
      actionId,
      matchingGrantIds: actionMatchedGrants.map((grant) => grant.grantId),
    };
  }

  return {
    cause: 'granted',
    activeSeat,
    actionClass,
    actionId,
    matchingGrantIds: zoneMatchedGrants.map((grant) => grant.grantId),
  };
};

export interface FreeOperationDiscoveryAnalysisResult {
  readonly denial: FreeOperationBlockExplanation;
  readonly executionPlayer: ReturnType<typeof asPlayerId>;
  readonly zoneFilter?: ConditionAST;
}

const parsePlayerId = (
  seat: string,
  seatResolution: SeatResolutionContext,
): ReturnType<typeof asPlayerId> | null => {
  const parsed = resolvePlayerIndexForTurnFlowSeat(seat, seatResolution.index);
  return parsed === null ? null : asPlayerId(parsed);
};

export const resolveFreeOperationDiscoveryAnalysis = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
  options?: {
    readonly zoneFilterErrorSurface?: FreeOperationZoneFilterSurface;
  },
): FreeOperationDiscoveryAnalysisResult => {
  if (move.freeOperation !== true || state.turnOrderState.type !== 'cardDriven') {
    return {
      denial: move.freeOperation === true ? { cause: 'nonCardDrivenTurnOrder' } : { cause: 'notFreeOperationMove' },
      executionPlayer: state.activePlayer,
    };
  }

  const analysis = analyzeFreeOperationGrantMatch(def, state, move, seatResolution, {
    evaluateZoneFilters: true,
    zoneFilterErrorSurface: options?.zoneFilterErrorSurface ?? 'turnFlowEligibility',
  });
  if (analysis === null) {
    return {
      denial: { cause: 'nonCardDrivenTurnOrder' },
      executionPlayer: state.activePlayer,
    };
  }

  const applicable = analysis.actionMatchedGrants;
  const prioritized = applicable.find((grant) => grant.executeAsSeat !== undefined) ?? applicable[0];
  const executionSeat = prioritized?.executeAsSeat ?? prioritized?.seat;
  const executionPlayer = executionSeat === undefined
    ? state.activePlayer
    : parsePlayerId(executionSeat, seatResolution) ?? state.activePlayer;

  const zoneFilters: ConditionAST[] = applicable
    .flatMap((grant) => (grant.zoneFilter === undefined ? [] : [grant.zoneFilter]));
  const [firstZoneFilter, ...remainingZoneFilters] = zoneFilters;
  const zoneFilter: ConditionAST | undefined = zoneFilters.length === 0
    ? undefined
    : zoneFilters.length === 1
      ? firstZoneFilter
      : { op: 'or', args: [firstZoneFilter!, ...remainingZoneFilters] };

  return {
    denial: explainFreeOperationBlockFromAnalysis(analysis),
    executionPlayer,
    ...(zoneFilter === undefined ? {} : { zoneFilter }),
  };
};

export const isFreeOperationApplicableForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
): boolean => {
  if (move.freeOperation !== true) {
    return true;
  }
  return (analyzeFreeOperationGrantMatch(def, state, move, seatResolution)?.actionMatchedGrants.length ?? 0) > 0;
};

export const isFreeOperationAllowedDuringMonsoonForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
  options?: {
    readonly zoneFilterErrorSurface?: FreeOperationZoneFilterSurface;
  },
): boolean => {
  if (move.freeOperation !== true) {
    return false;
  }
  const analysis = analyzeFreeOperationGrantMatch(def, state, move, seatResolution, {
    evaluateZoneFilters: true,
    zoneFilterErrorSurface: options?.zoneFilterErrorSurface ?? 'turnFlowEligibility',
  });
  if (analysis === null) {
    return false;
  }
  return analysis.zoneMatchedGrants.some((grant) => grant.allowDuringMonsoon === true);
};

export const isFreeOperationGrantedForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
): boolean => {
  if (move.freeOperation !== true) {
    return true;
  }
  const analysis = analyzeFreeOperationGrantMatch(def, state, move, seatResolution, { evaluateZoneFilters: true });
  if (analysis === null) {
    return false;
  }
  return analysis.zoneMatchedGrants.length > 0;
};
