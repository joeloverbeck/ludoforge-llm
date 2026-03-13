import type { Move } from '@ludoforge/engine/runtime';

import type { PlayerSeat } from './store-types.js';

export type SimpleAiSeat = Extract<PlayerSeat, 'ai-random' | 'ai-greedy'>;
export type MctsAiSeat = Extract<PlayerSeat, 'ai-mcts-fast' | 'ai-mcts-default' | 'ai-mcts-strong'>;
export type AiSeat = SimpleAiSeat | MctsAiSeat;

export function isMctsSeat(seat: string): seat is MctsAiSeat {
  return seat === 'ai-mcts-fast' || seat === 'ai-mcts-default' || seat === 'ai-mcts-strong';
}
export type AiPlaybackSpeed = '1x' | '2x' | '4x';

export interface AiMoveSelectionResult {
  readonly move: Move;
  readonly selectedIndex: number;
  readonly candidateCount: number;
}

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
): AiMoveSelectionResult | null {
  if (legalMoves.length === 0) {
    return null;
  }

  if (seat === 'ai-greedy') {
    return {
      move: legalMoves[0]!,
      selectedIndex: 0,
      candidateCount: legalMoves.length,
    };
  }

  const normalized = clampRandom(random());
  const index = Math.floor(normalized * legalMoves.length);
  const move = legalMoves[index] ?? legalMoves[0]!;
  return {
    move,
    selectedIndex: index,
    candidateCount: legalMoves.length,
  };
}

export function resolveAiSeat(seat: PlayerSeat | undefined): AiSeat {
  if (seat === 'ai-greedy') {
    return 'ai-greedy';
  }
  if (seat !== undefined && isMctsSeat(seat)) {
    return seat;
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
