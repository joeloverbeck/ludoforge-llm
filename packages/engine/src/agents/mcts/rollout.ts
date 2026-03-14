/**
 * Rollout (simulation) policy for MCTS search.
 *
 * Supports two modes:
 * - `epsilonGreedy`: samples candidate moves, evaluates one-step successors,
 *   picks the best with probability `1 - epsilon`, else picks random.
 * - `random`: picks a uniformly random candidate (for benchmarking).
 *
 * The rollout stops at terminal states, when no legal moves exist,
 * or when `maxSimulationDepth` plies have been simulated.
 */

import type { GameDef, GameState, Rng, TerminalResult } from '../../kernel/types.js';
import type { GameDefRuntime } from '../../kernel/gamedef-runtime.js';
import type { MctsConfig } from './config.js';
import { legalMoves } from '../../kernel/legal-moves.js';
import { applyMove } from '../../kernel/apply-move.js';
import { terminalResult } from '../../kernel/terminal.js';
import { evaluateState } from '../evaluate-state.js';
import { materializeConcreteCandidates } from './materialization.js';
import { nextInt, fork } from '../../kernel/prng.js';
import type { PlayerId } from '../../kernel/branded.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RolloutResult {
  readonly state: GameState;
  readonly terminal: TerminalResult | null;
  readonly rng: Rng;
  readonly depth: number;
}

// ---------------------------------------------------------------------------
// Rollout config subset
// ---------------------------------------------------------------------------

type RolloutConfigSlice = Pick<
  MctsConfig,
  'rolloutPolicy' | 'rolloutEpsilon' | 'rolloutCandidateSample' | 'maxSimulationDepth' | 'templateCompletionsPerVisit'
>;

// ---------------------------------------------------------------------------
// rollout
// ---------------------------------------------------------------------------

/**
 * Simulate play from a given state using an epsilon-greedy or random policy.
 *
 * Returns the final state reached, whether it is terminal, the consumed RNG,
 * and how many plies were simulated.
 */
export function rollout(
  def: GameDef,
  state: GameState,
  rng: Rng,
  config: RolloutConfigSlice,
  runtime?: GameDefRuntime,
): RolloutResult {
  let currentState = state;
  let currentRng = rng;
  let depth = 0;

  while (depth < config.maxSimulationDepth) {
    // 1. Check terminal
    const terminal = terminalResult(def, currentState, runtime);
    if (terminal !== null) {
      return { state: currentState, terminal, rng: currentRng, depth };
    }

    // 2. Enumerate legal moves
    const moves = legalMoves(def, currentState, undefined, runtime);
    if (moves.length === 0) {
      return { state: currentState, terminal: null, rng: currentRng, depth };
    }

    // 3. Sample up to rolloutCandidateSample candidates
    const { candidates, rng: postMaterializeRng } = materializeConcreteCandidates(
      def,
      currentState,
      moves,
      currentRng,
      config.templateCompletionsPerVisit,
      runtime,
    );
    currentRng = postMaterializeRng;

    if (candidates.length === 0) {
      return { state: currentState, terminal: null, rng: currentRng, depth };
    }

    // Sub-sample if we have more candidates than rolloutCandidateSample
    let sampled = candidates;
    if (candidates.length > config.rolloutCandidateSample) {
      sampled = sampleCandidates(candidates, config.rolloutCandidateSample, currentRng);
      // Advance RNG deterministically for the sampling
      const [, advancedRng] = fork(currentRng);
      currentRng = advancedRng;
    }

    // 4. Pick a move according to the policy
    let chosenIndex: number;

    if (config.rolloutPolicy === 'random' || sampled.length === 1) {
      // Random policy or single candidate — pick uniformly
      const [idx, rngAfter] = nextInt(currentRng, 0, sampled.length - 1);
      chosenIndex = idx;
      currentRng = rngAfter;
    } else {
      // Epsilon-greedy: with probability epsilon pick random, else pick best
      const [epsilonRoll, rngAfterEpsilon] = nextInt(currentRng, 0, 999);
      currentRng = rngAfterEpsilon;
      const useRandom = epsilonRoll < Math.round(config.rolloutEpsilon * 1000);

      if (useRandom) {
        const [idx, rngAfterIdx] = nextInt(currentRng, 0, sampled.length - 1);
        chosenIndex = idx;
        currentRng = rngAfterIdx;
      } else {
        // Greedy: evaluate each candidate's successor for the acting player
        const actingPlayer = currentState.activePlayer as PlayerId;
        let bestScore = -Infinity;
        let bestIdx = 0;

        for (let i = 0; i < sampled.length; i += 1) {
          const candidate = sampled[i]!;
          try {
            const applied = applyMove(def, currentState, candidate.move, undefined, runtime);
            const score = evaluateState(def, applied.state, actingPlayer, runtime);
            if (score > bestScore) {
              bestScore = score;
              bestIdx = i;
            }
          } catch {
            // If applying the move fails (e.g. illegal in current state),
            // skip this candidate.
            continue;
          }
        }

        chosenIndex = bestIdx;
      }
    }

    // 5. Apply chosen move
    const chosenMove = sampled[chosenIndex]!.move;
    try {
      const applied = applyMove(def, currentState, chosenMove, undefined, runtime);
      currentState = applied.state;
    } catch {
      // If the chosen move fails to apply, end the rollout
      return { state: currentState, terminal: null, rng: currentRng, depth };
    }

    depth += 1;
  }

  // Reached maxSimulationDepth — check terminal one more time
  const finalTerminal = terminalResult(def, currentState, runtime);
  return { state: currentState, terminal: finalTerminal, rng: currentRng, depth };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deterministically sample `count` candidates from the full list using
 * a Fisher-Yates partial shuffle seeded by the given RNG.
 */
function sampleCandidates<T>(
  candidates: readonly T[],
  count: number,
  rng: Rng,
): readonly T[] {
  const arr = [...candidates];
  let cursor = rng;
  const n = Math.min(count, arr.length);

  for (let i = 0; i < n; i += 1) {
    const [j, nextRng] = nextInt(cursor, i, arr.length - 1);
    cursor = nextRng;
    // Swap
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }

  return arr.slice(0, n);
}
