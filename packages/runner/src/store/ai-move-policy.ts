import type { Move } from '@ludoforge/engine/runtime';

import type { PlayerSeat } from './store-types.js';

export type AiSeat = Extract<PlayerSeat, 'ai-random' | 'ai-greedy'>;

const MIN_RANDOM = 0;
const MAX_RANDOM = 0.999_999_999;

function clampRandom(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_RANDOM;
  }
  return Math.min(MAX_RANDOM, Math.max(MIN_RANDOM, value));
}

export function selectAiMove(
  seat: AiSeat,
  legalMoves: readonly Move[],
  random: () => number = Math.random,
): Move | null {
  if (legalMoves.length === 0) {
    return null;
  }

  if (seat === 'ai-greedy') {
    return legalMoves[0] ?? null;
  }

  const normalized = clampRandom(random());
  const index = Math.floor(normalized * legalMoves.length);
  return legalMoves[index] ?? legalMoves[0] ?? null;
}

export function resolveAiSeat(seat: PlayerSeat | undefined): AiSeat {
  if (seat === 'ai-greedy') {
    return 'ai-greedy';
  }
  return 'ai-random';
}
