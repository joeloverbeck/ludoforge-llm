export const TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS = {
  ANALYZE_FREE_OPERATION_GRANT_MATCH: 'turnFlow.activeSeat.analyzeFreeOperationGrantMatch',
  APPLY_GRANT_FREE_OPERATION: 'turnFlow.activeSeat.applyGrantFreeOperation',
  APPLY_PENDING_FREE_OPERATION_VARIANTS: 'turnFlow.activeSeat.applyPendingFreeOperationVariants',
  APPLY_TURN_FLOW_ELIGIBILITY_AFTER_MOVE: 'turnFlow.activeSeat.applyTurnFlowEligibilityAfterMove',
  APPLY_TURN_FLOW_WINDOW_FILTERS: 'turnFlow.activeSeat.applyTurnFlowWindowFilters',
  CONSUME_TURN_FLOW_FREE_OPERATION_GRANT: 'turnFlow.activeSeat.consumeTurnFlowFreeOperationGrant',
  IS_ACTIVE_SEAT_ELIGIBLE_FOR_TURN_FLOW: 'turnFlow.activeSeat.isActiveSeatEligibleForTurnFlow',
  RESOLVE_CURRENT_COUP_SEAT: 'turnFlow.activeSeat.resolveCurrentCoupSeat',
} as const;

export type TurnFlowActiveSeatInvariantSurface =
  (typeof TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS)[keyof typeof TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS];

export const TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACES = Object.values(
  TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS,
) as readonly TurnFlowActiveSeatInvariantSurface[];
