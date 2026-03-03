import { CARD_SEAT_ORDER_MIN_DISTINCT_SEATS } from './turn-flow-seat-order-policy.js';
import type { TurnFlowActiveSeatInvariantSurface } from './turn-flow-active-seat-invariant-surfaces.js';
import {
  TURN_FLOW_ACTIVE_SEAT_UNRESOLVABLE_INVARIANT,
  TURN_FLOW_CARD_METADATA_SEAT_ORDER_SHAPE_INVALID_INVARIANT,
  type CardMetadataSeatOrderShapeInvariantContext,
  type TurnFlowActiveSeatInvariantContext,
} from './turn-flow-invariant-contract-types.js';
export {
  TURN_FLOW_ACTIVE_SEAT_UNRESOLVABLE_INVARIANT,
  TURN_FLOW_CARD_METADATA_SEAT_ORDER_SHAPE_INVALID_INVARIANT,
};
export type {
  CardMetadataSeatOrderShapeInvariantContext,
  TurnFlowActiveSeatInvariantContext,
} from './turn-flow-invariant-contract-types.js';
export type { TurnFlowActiveSeatInvariantSurface } from './turn-flow-active-seat-invariant-surfaces.js';

export const makeActiveSeatUnresolvableInvariantContext = (
  surface: TurnFlowActiveSeatInvariantSurface,
  activePlayer: number,
  seatOrder: readonly string[],
): TurnFlowActiveSeatInvariantContext => ({
  invariant: TURN_FLOW_ACTIVE_SEAT_UNRESOLVABLE_INVARIANT,
  surface,
  activePlayer,
  seatOrder: [...seatOrder],
});

export const activeSeatUnresolvableInvariantMessage = (
  context: Pick<TurnFlowActiveSeatInvariantContext, 'surface' | 'activePlayer' | 'seatOrder'>,
): string =>
  `Turn-flow runtime invariant failed: ${context.surface} could not resolve active seat for activePlayer=${String(context.activePlayer)} seatOrder=[${context.seatOrder.join(', ')}]`;

export const makeCardMetadataSeatOrderShapeInvariantContext = (
  context: {
    readonly cardId: string;
    readonly metadataKey: string;
  },
  distinctSeatCount: number,
  duplicates: readonly string[],
): CardMetadataSeatOrderShapeInvariantContext => ({
  invariant: TURN_FLOW_CARD_METADATA_SEAT_ORDER_SHAPE_INVALID_INVARIANT,
  cardId: context.cardId,
  metadataKey: context.metadataKey,
  minDistinctSeatCount: CARD_SEAT_ORDER_MIN_DISTINCT_SEATS,
  distinctSeatCount,
  duplicates: [...duplicates],
});

export const cardMetadataSeatOrderShapeInvariantMessage = (
  context: Pick<
    CardMetadataSeatOrderShapeInvariantContext,
    'cardId' | 'metadataKey' | 'minDistinctSeatCount' | 'distinctSeatCount' | 'duplicates'
  >,
): string =>
  `Turn-flow runtime invariant failed: card metadata seat order shape invalid (cardId=${context.cardId}, metadataKey=${context.metadataKey}, minDistinctSeatCount=${context.minDistinctSeatCount}, distinctSeatCount=${context.distinctSeatCount}, duplicates=[${context.duplicates.join(', ')}]).`;
