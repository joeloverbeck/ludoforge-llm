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
import { createNodePool } from './node-pool.js';
import { runSearch, selectRootDecision } from './search.js';

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

    return { move: bestChild.move as Move, rng: nextAgentRng };
  }
}
