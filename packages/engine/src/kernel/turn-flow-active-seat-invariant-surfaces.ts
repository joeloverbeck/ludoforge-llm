const TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_REGISTRY = [
  ['FREE_OPERATION_GRANT_MATCH_EVALUATION', 'turnFlow.activeSeat.freeOperationGrantMatchEvaluation'],
  ['FREE_OPERATION_GRANT_APPLICATION', 'turnFlow.activeSeat.freeOperationGrantApplication'],
  ['PENDING_FREE_OPERATION_VARIANT_APPLICATION', 'turnFlow.activeSeat.pendingFreeOperationVariantApplication'],
  ['POST_MOVE_ELIGIBILITY_APPLICATION', 'turnFlow.activeSeat.postMoveEligibilityApplication'],
  ['WINDOW_FILTER_APPLICATION', 'turnFlow.activeSeat.windowFilterApplication'],
  ['FREE_OPERATION_GRANT_CONSUMPTION', 'turnFlow.activeSeat.freeOperationGrantConsumption'],
  ['ELIGIBILITY_CHECK', 'turnFlow.activeSeat.eligibilityCheck'],
  ['COUP_SEAT_RESOLUTION', 'turnFlow.activeSeat.coupSeatResolution'],
] as const;

type TurnFlowActiveSeatInvariantSurfaceRegistryEntry = (typeof TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_REGISTRY)[number];
type TurnFlowActiveSeatInvariantSurfaceKey = TurnFlowActiveSeatInvariantSurfaceRegistryEntry[0];

export const TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS = Object.freeze(
  Object.fromEntries(TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_REGISTRY) as {
    readonly [K in TurnFlowActiveSeatInvariantSurfaceKey]:
      Extract<TurnFlowActiveSeatInvariantSurfaceRegistryEntry, readonly [K, string]>[1];
  },
);

export type TurnFlowActiveSeatInvariantSurface =
  (typeof TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS)[keyof typeof TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS];

export const TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACES = TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_REGISTRY.map(
  ([, surface]) => surface,
) as readonly TurnFlowActiveSeatInvariantSurface[];

const uniqueSurfaces = new Set(TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACES);
if (uniqueSurfaces.size !== TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACES.length) {
  throw new Error('turn-flow active-seat invariant surfaces must be unique');
}
