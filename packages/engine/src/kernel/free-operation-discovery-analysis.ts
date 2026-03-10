import { asPlayerId } from './branded.js';
import { isEvalErrorCode } from './eval-error.js';
import type { FreeOperationBlockExplanation } from './free-operation-denial-contract.js';
import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';
import {
  collectGrantMoveZoneCandidates,
  doesGrantPotentiallyAuthorizeMove,
  doesGrantRequireSequenceContextMatch,
  evaluateZoneFilterForMove,
  grantActionIds,
  isGrantOperationClassCompatible,
  isPendingFreeOperationGrantSequenceReady,
  moveOperationClass,
  resolveAuthorizedPendingFreeOperationGrantOverlapAmbiguity,
} from './free-operation-grant-authorization.js';
import { resolvePlayerIndexForTurnFlowSeat, type SeatResolutionContext } from './seat-resolution.js';
import { isTurnFlowErrorCode } from './turn-flow-error.js';
import type { ResolvedTurnFlowActionClass } from './turn-flow-action-class.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS } from './turn-flow-active-seat-invariant-surfaces.js';
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
  readonly contextMatchedGrants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly zoneMatchedGrants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly ambiguousGrantIds: readonly string[];
}

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
  const contextMatchedGrants = actionMatchedGrants.filter((grant) => doesGrantRequireSequenceContextMatch(
    def,
    state,
    grant,
    move,
    { allowUnresolvedMoveZones: true },
  ));
  const unresolvedZoneFilterGrants: TurnFlowPendingFreeOperationGrant[] = [];
  const zoneMatchedGrants = options?.evaluateZoneFilters === true
    ? contextMatchedGrants.filter(
        (grant) => {
          if (grant.zoneFilter === undefined) {
            return true;
          }
          try {
            return evaluateZoneFilterForMove(
              def,
              state,
              move,
              grant,
              grant.zoneFilter,
              options.zoneFilterErrorSurface ?? 'turnFlowEligibility',
            );
          } catch (cause) {
            const underlyingCause = isTurnFlowErrorCode(cause, 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED')
              ? (cause as Error & { cause?: unknown }).cause
              : cause;
            if (
              isEvalErrorCode(underlyingCause, 'MISSING_BINDING')
              && collectGrantMoveZoneCandidates(def, move, grant).length === 0
            ) {
              unresolvedZoneFilterGrants.push(grant);
              return false;
            }
            throw cause;
          }
        },
      )
    : actionMatchedGrants;
  const ambiguityCandidates =
    zoneMatchedGrants.length > 0 || unresolvedZoneFilterGrants.length <= 1
      ? zoneMatchedGrants
      : unresolvedZoneFilterGrants;
  const ambiguity = options?.evaluateZoneFilters === true
    ? resolveAuthorizedPendingFreeOperationGrantOverlapAmbiguity(def, state, ambiguityCandidates)
    : null;
  const ambiguousGrantIds = ambiguity?.strongestGrantIds ?? [];
  return {
    activeSeat,
    actionClass,
    actionId,
    pending,
    activeGrants,
    sequenceReadyGrants,
    actionClassMatchedGrants,
    actionMatchedGrants,
    contextMatchedGrants,
    zoneMatchedGrants,
    ambiguousGrantIds,
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
    contextMatchedGrants,
    zoneMatchedGrants,
    ambiguousGrantIds,
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

  if (contextMatchedGrants.length === 0) {
    return {
      cause: 'sequenceContextMismatch',
      activeSeat,
      actionClass,
      actionId,
      matchingGrantIds: actionMatchedGrants.map((grant) => grant.grantId),
      sequenceContextMismatchGrantIds: actionMatchedGrants.map((grant) => grant.grantId),
    };
  }

  if (ambiguousGrantIds.length > 0) {
    return {
      cause: 'ambiguousOverlap',
      activeSeat,
      actionClass,
      actionId,
      matchingGrantIds: zoneMatchedGrants.map((grant) => grant.grantId),
      ambiguousGrantIds,
    };
  }

  if (zoneMatchedGrants.length === 0) {
    return {
      cause: 'zoneFilterMismatch',
      activeSeat,
      actionClass,
      actionId,
      matchingGrantIds: contextMatchedGrants.map((grant) => grant.grantId),
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
  readonly executionContext?: TurnFlowPendingFreeOperationGrant['executionContext'] | undefined;
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

  const applicable = analysis.zoneMatchedGrants.length > 0 ? analysis.zoneMatchedGrants : analysis.contextMatchedGrants;
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
    ...(prioritized?.executionContext === undefined ? {} : { executionContext: prioritized.executionContext }),
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
  return (analyzeFreeOperationGrantMatch(def, state, move, seatResolution)?.contextMatchedGrants.length ?? 0) > 0;
};

export const isFreeOperationAllowedDuringMonsoonForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
  _options?: {
    readonly zoneFilterErrorSurface?: FreeOperationZoneFilterSurface;
  },
): boolean => {
  if (move.freeOperation !== true) {
    return false;
  }
  if (state.turnOrderState.type !== 'cardDriven') {
    return false;
  }
  const activeSeat = requireCardDrivenActiveSeat(
    def,
    state,
    TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_MATCH_EVALUATION,
    seatResolution,
  );
  const pending = state.turnOrderState.runtime.pendingFreeOperationGrants ?? [];
  return pending.some((grant) =>
    grant.seat === activeSeat
    && grant.allowDuringMonsoon === true
    && doesGrantPotentiallyAuthorizeMove(def, state, pending, grant, move));
};

export const isFreeOperationGrantedForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
  options?: {
    readonly zoneFilterErrorSurface?: FreeOperationZoneFilterSurface;
  },
): boolean => {
  if (move.freeOperation !== true) {
    return true;
  }
  const analysis = analyzeFreeOperationGrantMatch(def, state, move, seatResolution, {
    evaluateZoneFilters: true,
    zoneFilterErrorSurface: options?.zoneFilterErrorSurface ?? 'legalChoices',
  });
  if (analysis === null) {
    return false;
  }
  return analysis.zoneMatchedGrants.length > 0;
};
