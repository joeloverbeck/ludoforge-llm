/**
 * Pre-allocated node pool for MCTS search.
 *
 * Avoids per-iteration GC pressure by recycling a fixed-capacity array of
 * MctsNode objects.  The pool is **mutable** — same rationale as node.ts.
 */

import type { MctsNode } from './node.js';
import { createRootNode } from './node.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface NodePool {
  /** Maximum number of nodes this pool can hold. */
  readonly capacity: number;

  /**
   * Return the next available node (pre-allocated, stats zeroed).
   * @throws RangeError if the pool is exhausted.
   */
  allocate(): MctsNode;

  /**
   * Reset the pool so all slots can be reused from the start.
   * Does **not** shrink the backing array.
   */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function resetNode(node: MctsNode, playerCount: number): void {
  // Mutable reset — intentional for pool reuse
  node.visits = 0;
  node.availability = 0;
  for (let i = 0; i < playerCount; i++) {
    node.totalReward[i] = 0;
  }
  node.heuristicPrior = null;
  node.children.length = 0;
  node.provenResult = null;
  node.nodeKind = 'state';
  node.decisionPlayer = null;
  node.partialMove = null;
  node.decisionBinding = null;
}

/**
 * Create a node pool with the given capacity.
 *
 * Sizing rule (from spec): `capacity = max(iterations + 1, rootLegalMoveCount * 4)`.
 *
 * @param capacity    - maximum node count
 * @param playerCount - number of players (determines totalReward array length)
 */
export function createNodePool(capacity: number, playerCount: number): NodePool {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError(`NodePool capacity must be a positive safe integer, got ${capacity}`);
  }
  if (!Number.isSafeInteger(playerCount) || playerCount < 1) {
    throw new RangeError(`NodePool playerCount must be a positive safe integer, got ${playerCount}`);
  }

  // Pre-allocate all nodes up front
  const nodes: MctsNode[] = new Array<MctsNode>(capacity);
  for (let i = 0; i < capacity; i++) {
    nodes[i] = createRootNode(playerCount);
  }

  let nextIndex = 0;

  return {
    get capacity() {
      return capacity;
    },

    allocate(): MctsNode {
      if (nextIndex >= capacity) {
        throw new RangeError(
          `NodePool exhausted: all ${capacity} nodes have been allocated`,
        );
      }
      const node = nodes[nextIndex]!;
      nextIndex++;
      return node;
    },

    reset(): void {
      for (let i = 0; i < nextIndex; i++) {
        resetNode(nodes[i]!, playerCount);
      }
      nextIndex = 0;
    },
  };
}
