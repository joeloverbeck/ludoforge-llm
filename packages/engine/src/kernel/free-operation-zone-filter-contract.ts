import type { TurnFlowActiveSeatInvariantSurface } from './turn-flow-active-seat-invariant-surfaces.js';

export const FREE_OPERATION_ZONE_FILTER_SURFACES = ['turnFlowEligibility', 'legalChoices'] as const;

export type FreeOperationZoneFilterSurface =
  | (typeof FREE_OPERATION_ZONE_FILTER_SURFACES)[number]
  | TurnFlowActiveSeatInvariantSurface;
