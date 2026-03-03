export const CARD_SEAT_ORDER_MIN_DISTINCT_SEATS = 2;

export const isCardSeatOrderDistinctSeatCountValid = (
  distinctSeatCount: number,
): boolean => distinctSeatCount >= CARD_SEAT_ORDER_MIN_DISTINCT_SEATS;
