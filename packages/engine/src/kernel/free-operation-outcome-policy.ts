import { deepEqual } from './deep-equal.js';
import { compareTurnFlowFreeOperationGrantPriority } from '../contracts/index.js';
import {
  doesGrantPotentiallyAuthorizeMove,
  resolveAuthorizedPendingFreeOperationGrants,
} from './free-operation-grant-authorization.js';
import type { SeatResolutionContext } from './identity.js';
import { materialGameplayStateProjection } from './material-gameplay-state.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS, type TurnFlowActiveSeatInvariantSurface } from './turn-flow-active-seat-invariant-surfaces.js';
import { requireCardDrivenActiveSeat } from './turn-flow-runtime-invariants.js';
import type { GameDef, GameState, Move, TurnFlowPendingFreeOperationGrant } from './types.js';

const selectStrongestOutcomeGrant = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
): TurnFlowPendingFreeOperationGrant | null =>
  grants.reduce<TurnFlowPendingFreeOperationGrant | null>((selected, grant) => {
    if (selected === null) {
      return grant;
    }
    return compareTurnFlowFreeOperationGrantPriority(selected, grant) <= 0
      ? selected
      : grant;
  }, null);

export const resolveStrongestRequiredFreeOperationOutcomeGrant = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
  surfaceId: TurnFlowActiveSeatInvariantSurface = TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_CONSUMPTION,
): TurnFlowPendingFreeOperationGrant | null => {
  if (move.freeOperation !== true || state.turnOrderState.type !== 'cardDriven') {
    return null;
  }
  const activeSeat = requireCardDrivenActiveSeat(def, state, surfaceId, seatResolution);
  const pending = state.turnOrderState.runtime.pendingFreeOperationGrants ?? [];
  return resolveAuthorizedPendingFreeOperationGrants(def, state, pending, activeSeat, move, {
    zoneFilterErrorSurface: surfaceId,
  }).strongestOutcomeGrant;
};

export const resolveStrongestPotentialRequiredFreeOperationOutcomeGrant = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
  surfaceId: TurnFlowActiveSeatInvariantSurface = TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_CONSUMPTION,
): TurnFlowPendingFreeOperationGrant | null => {
  if (move.freeOperation !== true || state.turnOrderState.type !== 'cardDriven') {
    return null;
  }
  const activeSeat = requireCardDrivenActiveSeat(def, state, surfaceId, seatResolution);
  const pending = state.turnOrderState.runtime.pendingFreeOperationGrants ?? [];
  return selectStrongestOutcomeGrant(
    pending.filter(
      (grant) =>
        grant.seat === activeSeat
        && grant.outcomePolicy === 'mustChangeGameplayState'
        && doesGrantPotentiallyAuthorizeMove(def, state, pending, grant, move, {
          useProbeBindings: true,
          zoneFilterErrorSurface: surfaceId,
        }),
    ),
  );
};

export const doesMaterialGameplayStateChange = (
  def: GameDef,
  beforeState: GameState,
  afterState: GameState,
): boolean => !deepEqual(
  materialGameplayStateProjection(def, beforeState),
  materialGameplayStateProjection(def, afterState),
);
