/**
 * Open-loop MCTS node structure.
 *
 * Nodes are keyed by action history, not game state.  Statistics fields are
 * intentionally **mutable** for search performance — this is an explicit
 * exception to the engine-wide immutability rule, isolated to MCTS internals.
 */

import type { Move } from '../../kernel/types-core.js';
import type { PlayerId } from '../../kernel/branded.js';
import type { MoveKey } from './move-key.js';

// ---------------------------------------------------------------------------
// Proven result (restricted solver mode)
// ---------------------------------------------------------------------------

export type ProvenResult =
  | { readonly kind: 'win'; readonly forPlayer: PlayerId }
  | { readonly kind: 'loss'; readonly forPlayer: PlayerId }
  | { readonly kind: 'draw' };

// ---------------------------------------------------------------------------
// Node interface
// ---------------------------------------------------------------------------

/**
 * A single node in the open-loop MCTS tree.
 *
 * Mutable fields (`visits`, `availability`, `totalReward`, `heuristicPrior`,
 * `children`, `provenResult`) are updated in-place during search for
 * performance.  The node is never exposed outside the MCTS module.
 */
export interface MctsNode {
  /** Concrete move that led to this node.  Null for root. */
  readonly move: Move | null;

  /** Canonical key for move deduplication.  Null for root. */
  readonly moveKey: MoveKey | null;

  /** Parent pointer for backpropagation.  Null for root. */
  readonly parent: MctsNode | null;

  /** Number of completed simulations through this node. */
  visits: number;

  /** Number of times this move was available for selection at its parent. */
  availability: number;

  /** Cumulative per-player utility totals (length = playerCount). */
  totalReward: number[];

  /** Optional heuristic prior captured at expansion time. */
  heuristicPrior: number[] | null;

  /** Concrete child nodes. */
  children: MctsNode[];

  /** Optional proven result; only used in restricted solver mode. */
  provenResult: ProvenResult | null;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Create the root node of a new search tree.
 *
 * @param playerCount - number of players (determines totalReward length)
 */
export function createRootNode(playerCount: number): MctsNode {
  return {
    move: null,
    moveKey: null,
    parent: null,
    visits: 0,
    availability: 0,
    totalReward: new Array<number>(playerCount).fill(0),
    heuristicPrior: null,
    children: [],
    provenResult: null,
  };
}

/**
 * Create a child node linked to its parent.
 *
 * @param parent      - the parent node
 * @param move        - concrete move leading to this child
 * @param moveKey     - canonical key for the move
 * @param playerCount - number of players
 */
export function createChildNode(
  parent: MctsNode,
  move: Move,
  moveKey: MoveKey,
  playerCount: number,
): MctsNode {
  const child: MctsNode = {
    move,
    moveKey,
    parent,
    visits: 0,
    availability: 0,
    totalReward: new Array<number>(playerCount).fill(0),
    heuristicPrior: null,
    children: [],
    provenResult: null,
  };
  parent.children.push(child);
  return child;
}
