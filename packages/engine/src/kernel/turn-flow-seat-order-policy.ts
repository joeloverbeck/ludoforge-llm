import type { SeatOrderShapeAnalysis } from './seat-resolution.js';

export const CARD_SEAT_ORDER_MIN_DISTINCT_SEATS = 2;

export const isCardSeatOrderDistinctSeatCountValid = (
  shape: Pick<SeatOrderShapeAnalysis, 'distinctSeatCount'>,
): boolean => shape.distinctSeatCount >= CARD_SEAT_ORDER_MIN_DISTINCT_SEATS;
