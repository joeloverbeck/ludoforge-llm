import type { GameDef } from './types.js';

export const normalizeSeatKey = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]/gu, '');

export const normalizeSeatOrder = (seats: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const seat of seats) {
    if (seen.has(seat)) {
      continue;
    }
    seen.add(seat);
    ordered.push(seat);
  }
  return ordered;
};

export const parseNumericSeatPlayer = (seat: string, playerCount: number): number | null => {
  if (!/^\d+$/.test(seat)) {
    return null;
  }
  const parsed = Number(seat);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed >= playerCount) {
    return null;
  }
  return parsed;
};

export interface SeatResolutionIndex {
  readonly seatIdByPlayerIndex: readonly (string | null)[];
  readonly playerIndexBySeatId: ReadonlyMap<string, number>;
  readonly playerIndexByNormalizedSeatId: ReadonlyMap<string, number>;
  readonly playerIndexByCardSeatKey: ReadonlyMap<string, number>;
  readonly playerIndexByNormalizedCardSeatKey: ReadonlyMap<string, number>;
}

export const buildSeatResolutionIndex = (
  def: Pick<GameDef, 'seats' | 'turnOrder'>,
  playerCount: number,
): SeatResolutionIndex => {
  const seatIdByPlayerIndex: (string | null)[] = Array.from({ length: playerCount }, () => null);
  const playerIndexBySeatId = new Map<string, number>();
  const playerIndexByNormalizedSeatId = new Map<string, number>();

  for (let index = 0; index < playerCount; index += 1) {
    const seatId = def.seats?.[index]?.id;
    if (typeof seatId !== 'string' || seatId.length === 0) {
      continue;
    }
    seatIdByPlayerIndex[index] = seatId;
    if (!playerIndexBySeatId.has(seatId)) {
      playerIndexBySeatId.set(seatId, index);
    }
    const normalizedSeatId = normalizeSeatKey(seatId);
    if (normalizedSeatId.length > 0 && !playerIndexByNormalizedSeatId.has(normalizedSeatId)) {
      playerIndexByNormalizedSeatId.set(normalizedSeatId, index);
    }
  }

  const playerIndexByCardSeatKey = new Map<string, number>();
  const playerIndexByNormalizedCardSeatKey = new Map<string, number>();
  const cardSeatOrderMapping = def.turnOrder?.type === 'cardDriven'
    ? def.turnOrder.config.turnFlow.cardSeatOrderMapping
    : undefined;
  for (const [cardSeatKey, seatId] of Object.entries(cardSeatOrderMapping ?? {})) {
    const mappedPlayerIndex = playerIndexBySeatId.get(seatId)
      ?? playerIndexByNormalizedSeatId.get(normalizeSeatKey(seatId))
      ?? null;
    if (mappedPlayerIndex === null) {
      continue;
    }

    if (!playerIndexByCardSeatKey.has(cardSeatKey)) {
      playerIndexByCardSeatKey.set(cardSeatKey, mappedPlayerIndex);
    }

    const normalizedCardSeatKey = normalizeSeatKey(cardSeatKey);
    if (normalizedCardSeatKey.length > 0 && !playerIndexByNormalizedCardSeatKey.has(normalizedCardSeatKey)) {
      playerIndexByNormalizedCardSeatKey.set(normalizedCardSeatKey, mappedPlayerIndex);
    }
  }

  return {
    seatIdByPlayerIndex,
    playerIndexBySeatId,
    playerIndexByNormalizedSeatId,
    playerIndexByCardSeatKey,
    playerIndexByNormalizedCardSeatKey,
  };
};

export const resolvePlayerIndexForSeatValue = (
  seatValue: string,
  playerCount: number,
  index: SeatResolutionIndex,
): number | null => {
  const fromCardSeat = index.playerIndexByCardSeatKey.get(seatValue);
  if (fromCardSeat !== undefined) {
    return fromCardSeat;
  }

  const normalizedSeatValue = normalizeSeatKey(seatValue);
  if (normalizedSeatValue.length > 0) {
    const fromNormalizedCardSeat = index.playerIndexByNormalizedCardSeatKey.get(normalizedSeatValue);
    if (fromNormalizedCardSeat !== undefined) {
      return fromNormalizedCardSeat;
    }
  }

  const fromSeatId = index.playerIndexBySeatId.get(seatValue);
  if (fromSeatId !== undefined) {
    return fromSeatId;
  }

  if (normalizedSeatValue.length > 0) {
    const fromNormalizedSeatId = index.playerIndexByNormalizedSeatId.get(normalizedSeatValue);
    if (fromNormalizedSeatId !== undefined) {
      return fromNormalizedSeatId;
    }
  }

  return parseNumericSeatPlayer(seatValue, playerCount);
};

export const resolvePlayerIndexForTurnFlowSeat = (
  def: Pick<GameDef, 'seats' | 'turnOrder'>,
  playerCount: number,
  seat: string,
): number | null => {
  const seatResolutionIndex = buildSeatResolutionIndex(def, playerCount);
  const resolved = resolvePlayerIndexForSeatValue(seat, playerCount, seatResolutionIndex);
  if (resolved !== null) {
    return resolved;
  }

  if (def.turnOrder?.type !== 'cardDriven') {
    return null;
  }

  const eligibilitySeats = def.turnOrder.config.turnFlow.eligibility.seats;
  const directIndex = eligibilitySeats.findIndex((entry) => entry === seat);
  if (directIndex >= 0 && directIndex < playerCount) {
    return directIndex;
  }

  const normalizedSeat = normalizeSeatKey(seat);
  if (normalizedSeat.length === 0) {
    return null;
  }
  const normalizedIndex = eligibilitySeats.findIndex((entry) => normalizeSeatKey(entry) === normalizedSeat);
  return normalizedIndex >= 0 && normalizedIndex < playerCount ? normalizedIndex : null;
};

export const resolveTurnFlowSeatForPlayerIndex = (
  def: Pick<GameDef, 'seats' | 'turnOrder'>,
  playerCount: number,
  seatOrder: readonly string[],
  playerIndex: number,
): string | null => {
  for (const seat of seatOrder) {
    if (resolvePlayerIndexForTurnFlowSeat(def, playerCount, seat) === playerIndex) {
      return seat;
    }
  }

  const seatId = def.seats?.[playerIndex]?.id;
  if (typeof seatId === 'string' && seatOrder.includes(seatId)) {
    return seatId;
  }

  const numericSeat = String(playerIndex);
  return seatOrder.includes(numericSeat) ? numericSeat : null;
};
