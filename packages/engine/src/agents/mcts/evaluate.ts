import type { PlayerId } from '../../kernel/branded.js';
import type { GameDef, GameState, TerminalResult } from '../../kernel/types.js';
import type { GameDefRuntime } from '../../kernel/gamedef-runtime.js';
import { evaluateState } from '../evaluate-state.js';

/**
 * Map a terminal game result to a `[0,1]` reward vector (one entry per player).
 *
 * - `win`:     winner gets 1.0, all others 0.0
 * - `draw`:    every player gets 0.5
 * - `lossAll`: every player gets 0.0
 * - `score`:   scores are min-max normalized to `[0,1]` with tie preservation.
 *              When all scores are equal (range = 0), every player gets 1.0.
 */
export const terminalToRewards = (result: TerminalResult, playerCount: number): readonly number[] => {
  switch (result.type) {
    case 'win': {
      const rewards = Array.from<number>({ length: playerCount }).fill(0);
      rewards[result.player] = 1;
      return rewards;
    }
    case 'draw':
      return Array.from<number>({ length: playerCount }).fill(0.5);
    case 'lossAll':
      return Array.from<number>({ length: playerCount }).fill(0);
    case 'score': {
      const scores = Array.from<number>({ length: playerCount }).fill(0);
      for (const entry of result.ranking) {
        scores[entry.player] = entry.score;
      }
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      const range = max - min;
      if (range === 0) {
        return Array.from<number>({ length: playerCount }).fill(1);
      }
      return scores.map((s) => (s - min) / range);
    }
  }
};

/**
 * Standard logistic sigmoid: `1 / (1 + exp(-x))`.
 * Output is always in the open interval `(0, 1)` for finite inputs.
 */
export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/**
 * Optional output parameter for capturing raw evaluation data.
 * Used by diagnostics instrumentation without changing the return type.
 */
export interface EvalDiagnosticsOut {
  rawScores?: readonly number[];
}

/**
 * Evaluate a non-terminal state for all players and return a `(0,1)` reward
 * vector using a centered-logistic transform.
 *
 * 1. Call `evaluateState(def, state, player)` for each player to get raw scores.
 * 2. Compute the mean of raw scores.
 * 3. Return `sigmoid((raw - mean) / temperature)` per player.
 *
 * The centering ensures that when all players have equal evaluations the output
 * is exactly `0.5` for everyone. The `temperature` parameter controls the
 * spread — higher temperature compresses outputs toward `0.5`.
 *
 * When `diagnosticsOut` is provided, the raw evaluation scores (before
 * centering and sigmoid) are written to it. This is a side-channel for
 * diagnostics and does not affect the return value.
 */
export const evaluateForAllPlayers = (
  def: GameDef,
  state: GameState,
  temperature: number,
  runtime?: GameDefRuntime,
  diagnosticsOut?: EvalDiagnosticsOut,
): readonly number[] => {
  const raw: readonly number[] = Array.from({ length: state.playerCount }, (_, i) =>
    evaluateState(def, state, i as PlayerId, runtime),
  );
  if (diagnosticsOut !== undefined) {
    diagnosticsOut.rawScores = raw;
  }
  const mean = raw.reduce((sum, v) => sum + v, 0) / raw.length;
  return raw.map((v) => sigmoid((v - mean) / temperature));
};
