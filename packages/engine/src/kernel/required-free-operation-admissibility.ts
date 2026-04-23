import { cardDrivenRuntime } from './card-driven-accessors.js';
import {
  doesGrantAuthorizeMove,
  doesGrantPotentiallyAuthorizeMove,
} from './free-operation-grant-authorization.js';
import type { SeatResolutionContext } from './identity.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS } from './turn-flow-active-seat-invariant-surfaces.js';
import { requireCardDrivenActiveSeat } from './turn-flow-runtime-invariants.js';
import type { GameDef, GameState, Move, TurnFlowPendingFreeOperationGrant } from './types.js';

export type RequiredPendingFreeOperationGrantAuthorizationMode = 'potential' | 'resolved';

const isBlockingPendingFreeOperationGrant = (
  grant: TurnFlowPendingFreeOperationGrant,
): boolean =>
  (grant.phase === 'ready' || grant.phase === 'offered')
  && (grant.completionPolicy === 'required' || grant.completionPolicy === 'skipIfNoLegalCompletion');

const hasReadyPendingFreeOperationGrantForSeat = (
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  seat: string,
): boolean =>
  pending.some((grant) =>
    grant.seat === seat
    && isBlockingPendingFreeOperationGrant(grant));

export const hasActiveSeatRequiredPendingFreeOperationGrant = (
  def: GameDef,
  state: GameState,
  seatResolution: SeatResolutionContext,
): boolean => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return false;
  }
  const activeSeat = requireCardDrivenActiveSeat(
    def,
    state,
    TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.ELIGIBILITY_CHECK,
    seatResolution,
  );
  return hasReadyPendingFreeOperationGrantForSeat(
    runtime.pendingFreeOperationGrants ?? [],
    activeSeat,
  );
};

export const isMoveAllowedByRequiredPendingFreeOperationGrant = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
  options?: {
    readonly authorization?: RequiredPendingFreeOperationGrantAuthorizationMode;
  },
): boolean => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return true;
  }
  const activeSeat = requireCardDrivenActiveSeat(
    def,
    state,
    TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.WINDOW_FILTER_APPLICATION,
    seatResolution,
  );
  const pending = runtime.pendingFreeOperationGrants ?? [];
  if (!hasReadyPendingFreeOperationGrantForSeat(pending, activeSeat)) {
    return true;
  }
  if (move.freeOperation !== true) {
    return false;
  }
  const authorize = options?.authorization === 'resolved'
    ? (grant: TurnFlowPendingFreeOperationGrant): boolean =>
      doesGrantAuthorizeMove(def, state, pending, grant, move, { zoneFilterErrorSurface: 'turnFlowEligibility' })
    : (grant: TurnFlowPendingFreeOperationGrant): boolean =>
      doesGrantPotentiallyAuthorizeMove(def, state, pending, grant, move);
  return pending.some((grant) =>
    grant.seat === activeSeat
    && isBlockingPendingFreeOperationGrant(grant)
    && authorize(grant));
};
