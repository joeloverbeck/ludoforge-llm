import type { TurnFlowActiveSeatInvariantSurface } from './turn-flow-active-seat-invariant-surfaces.js';

export const TURN_FLOW_ACTIVE_SEAT_UNRESOLVABLE_INVARIANT = 'turnFlow.activeSeat.unresolvable';
export const TURN_FLOW_CARD_METADATA_SEAT_ORDER_SHAPE_INVALID_INVARIANT =
  'turnFlow.cardMetadataSeatOrder.shapeInvalid';

export interface TurnFlowActiveSeatInvariantContext {
  readonly invariant: typeof TURN_FLOW_ACTIVE_SEAT_UNRESOLVABLE_INVARIANT;
  readonly surface: TurnFlowActiveSeatInvariantSurface;
  readonly activePlayer: number;
  readonly seatOrder: readonly string[];
}

export interface CardMetadataSeatOrderShapeInvariantContext {
  readonly invariant: typeof TURN_FLOW_CARD_METADATA_SEAT_ORDER_SHAPE_INVALID_INVARIANT;
  readonly cardId: string;
  readonly metadataKey: string;
  readonly minDistinctSeatCount: number;
  readonly distinctSeatCount: number;
  readonly duplicates: readonly string[];
}
