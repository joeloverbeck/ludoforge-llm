import type { Move } from '@ludoforge/engine/runtime';

import type { PlayerSeat } from './store-types.js';

export type AiSeat = Extract<PlayerSeat, 'ai-random' | 'ai-greedy'>;
export type AiPlaybackSpeed = '1x' | '2x' | '4x';

const MIN_RANDOM = 0;
const MAX_RANDOM = 0.999_999_999;
const BASE_STEP_DELAY_MS = 500;
const SPEED_MULTIPLIERS: Readonly<Record<AiPlaybackSpeed, number>> = {
  '1x': 1,
  '2x': 2,
  '4x': 4,
};

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

export function resolveAiPlaybackDelayMs(speed: AiPlaybackSpeed, baseDelayMs = BASE_STEP_DELAY_MS): number {
  const multiplier = SPEED_MULTIPLIERS[speed];
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new Error('AI playback base delay must be a finite number >= 0.');
  }

  return Math.round(baseDelayMs / multiplier);
}
