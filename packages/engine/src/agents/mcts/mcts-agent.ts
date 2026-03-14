/**
 * MCTS agent — wraps the search loop in a class implementing the `Agent`
 * interface.  Handles RNG isolation, runtime building, single-move
 * short-circuit, and root decision selection.
 */

import type { Agent, Move, Rng } from '../../kernel/types.js';
import type { GameDefRuntime } from '../../kernel/gamedef-runtime.js';
import type { PlayerId } from '../../kernel/branded.js';
import type { MctsConfig } from './config.js';
import { validateMctsConfig } from './config.js';
import { createGameDefRuntime } from '../../kernel/gamedef-runtime.js';
import { fork } from '../../kernel/prng.js';
import { derivePlayerObservation } from '../../kernel/observation.js';
import { createRootNode } from './node.js';
import type { MctsNode } from './node.js';
import { createNodePool } from './node-pool.js';
import { runSearch, selectRootDecision } from './search.js';
import { legalChoicesEvaluate } from '../../kernel/legal-choices.js';
import { completeTemplateMove } from '../../kernel/move-completion.js';
import { selectStochasticFallback } from '../agent-move-selection.js';

// ---------------------------------------------------------------------------
// Post-completion: ensure the selected move is fully resolved
// ---------------------------------------------------------------------------

/**
 * Verify that the MCTS-selected move is fully complete against the *real*
 * game state.  If the best child's move still has pending decisions (e.g.
 * from stochastic resolution during search), attempt completion.
 *
 * Fallback chain:
 * 1. Fast-path: `legalChoicesEvaluate` says the move is complete → return.
 * 2. Try `completeTemplateMove` on the best child's move.
 * 3. Try siblings in descending visit-count order.
 * 4. Fall back to `completeTemplateMove` on original legal moves.
 * 5. Last resort: `selectStochasticFallback` on stochastic completions.
 */
export function postCompleteSelectedMove(
  def: Parameters<Agent['chooseMove']>[0]['def'],
  state: Parameters<Agent['chooseMove']>[0]['state'],
  root: MctsNode,
  bestChild: MctsNode,
  legalMovesList: readonly Move[],
  rng: Rng,
  runtime: GameDefRuntime,
): { readonly move: Move; readonly rng: Rng } {
  const bestMove = bestChild.move as Move;
  let cursor: Rng = rng;

  // 1. Fast-path: check if the move is already complete.
  try {
    const choiceResult = legalChoicesEvaluate(def, state, bestMove, undefined, runtime);
    if (choiceResult.kind !== 'pending' && choiceResult.kind !== 'illegal') {
      return { move: bestMove, rng: cursor };
    }
  } catch {
    // Fall through to completion attempts.
  }

  // 2. Try completing the best child's move against the real state.
  try {
    const result = completeTemplateMove(def, state, bestMove, cursor, runtime);
    if (result.kind === 'completed') {
      return { move: result.move, rng: result.rng };
    }
    if (result.kind === 'stochasticUnresolved') {
      cursor = result.rng;
    }
  } catch {
    // Move is invalid against real state — fall through to siblings.
  }

  // 3. Try siblings in descending visit-count order.
  const siblings = [...root.children]
    .filter((c) => c !== bestChild && c.move !== null)
    .sort((a, b) => b.visits - a.visits);

  for (const sibling of siblings) {
    const siblingMove = sibling.move as Move;
    // Check if sibling is directly complete.
    try {
      const choiceResult = legalChoicesEvaluate(def, state, siblingMove, undefined, runtime);
      if (choiceResult.kind !== 'pending' && choiceResult.kind !== 'illegal') {
        return { move: siblingMove, rng: cursor };
      }
    } catch {
      // Skip this sibling for direct check — try completion below.
    }
    // Try completing the sibling.
    try {
      const result = completeTemplateMove(def, state, siblingMove, cursor, runtime);
      if (result.kind === 'completed') {
        return { move: result.move, rng: result.rng };
      }
      if (result.kind === 'stochasticUnresolved') {
        cursor = result.rng;
      }
    } catch {
      // Sibling also invalid — try next.
    }
  }

  // 4. Fall back to RandomAgent-style completion of original legal moves.
  const completedMoves: Move[] = [];
  const stochasticMoves: Move[] = [];

  for (const move of legalMovesList) {
    const result = completeTemplateMove(def, state, move, cursor, runtime);
    if (result.kind === 'completed') {
      completedMoves.push(result.move);
      cursor = result.rng;
    } else if (result.kind === 'stochasticUnresolved') {
      stochasticMoves.push(result.move);
      cursor = result.rng;
    }
  }

  if (completedMoves.length > 0) {
    return { move: completedMoves[0]!, rng: cursor };
  }

  // 5. Last resort: stochastic fallback.
  if (stochasticMoves.length > 0) {
    return selectStochasticFallback(stochasticMoves, cursor);
  }

  // Should not happen if legalMoves was non-empty, but be safe.
  return { move: bestMove, rng: cursor };
}

export class MctsAgent implements Agent {
  readonly config: MctsConfig;

  constructor(partial: Partial<MctsConfig> = {}) {
    this.config = validateMctsConfig(partial);
  }

  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    const { def, state, playerId, legalMoves, rng } = input;

    if (legalMoves.length === 0) {
      throw new Error('MctsAgent.chooseMove called with empty legalMoves');
    }

    // Single-move short-circuit — no search needed.
    if (legalMoves.length === 1) {
      return { move: legalMoves[0]!, rng };
    }

    // Build or reuse runtime.
    const runtime: GameDefRuntime = input.runtime ?? createGameDefRuntime(def);

    // Fork RNG: one for search (consumed internally), one for the caller.
    const [searchRng, nextAgentRng]: readonly [Rng, Rng] = fork(rng);

    // Derive observation for belief sampling.
    const observation = derivePlayerObservation(def, state, playerId as PlayerId);

    // Allocate root node and node pool.
    const root = createRootNode(state.playerCount);
    const poolCapacity = Math.max(this.config.iterations + 1, legalMoves.length * 4);
    const pool = createNodePool(poolCapacity, state.playerCount);

    // Run MCTS search.
    runSearch(
      root,
      def,
      state,
      observation,
      playerId as PlayerId,
      this.config,
      searchRng,
      legalMoves,
      runtime,
      pool,
    );

    // Select best child by visit count.
    const bestChild = selectRootDecision(root, playerId as PlayerId);

    // Post-complete: ensure the selected move is fully resolved against
    // the real state (not a belief sample).  This prevents returning moves
    // with incomplete decision parameters.
    return postCompleteSelectedMove(
      def,
      state,
      root,
      bestChild,
      legalMoves,
      nextAgentRng,
      runtime,
    );
  }
}
