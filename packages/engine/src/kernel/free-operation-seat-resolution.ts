export const resolveFreeOperationGrantSeatToken = (
  token: string,
  activeSeat: string,
  seatOrder: readonly string[],
): string | null => {
  if (token === 'self') {
    return activeSeat;
  }
  return seatOrder.includes(token) ? token : null;
};
