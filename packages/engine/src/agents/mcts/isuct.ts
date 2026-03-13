/**
 * Availability-aware ISUCT selection formula for hidden-information MCTS.
 *
 * Uses per-child availability counts instead of parent visit counts in the
 * exploration term, which is the correct formulation for information-set MCTS
 * where not every action is available in every sampled world.
 */

import type { PlayerId } from '../../kernel/branded.js';
import type { MctsNode } from './node.js';

/**
 * Select the best child from the available children using ISUCT.
 *
 * 1. If any available children have `visits === 0`, return the first unvisited
 *    one (expansion preference).
 * 2. Otherwise compute the ISUCT score for each available child and return the
 *    one with the highest score.  Ties are broken by first-found order.
 *
 * @param _node                - parent node (unused, kept for call-site clarity)
 * @param exploringPlayer      - the player whose reward we maximise
 * @param explorationConstant  - C parameter balancing exploitation/exploration
 * @param availableChildren    - children legal in the current sampled state
 * @returns the selected child node
 * @throws if `availableChildren` is empty
 */
export function selectChild(
  _node: MctsNode,
  exploringPlayer: PlayerId,
  explorationConstant: number,
  availableChildren: readonly MctsNode[],
): MctsNode {
  if (availableChildren.length === 0) {
    throw new Error(
      'selectChild: no available children — cannot select from empty list',
    );
  }

  // Prefer unvisited children for expansion.
  for (const child of availableChildren) {
    if (child.visits === 0) {
      return child;
    }
  }

  // All visited — compute ISUCT scores.
  // Length >= 1 guaranteed by the empty check above.
  let bestChild: MctsNode = availableChildren[0]!;
  let bestScore = isuctScore(bestChild, exploringPlayer, explorationConstant);

  for (let i = 1; i < availableChildren.length; i++) {
    const child: MctsNode = availableChildren[i]!;
    const score = isuctScore(child, exploringPlayer, explorationConstant);
    if (score > bestScore) {
      bestScore = score;
      bestChild = child;
    }
  }

  return bestChild;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function isuctScore(
  child: MctsNode,
  exploringPlayer: PlayerId,
  C: number,
): number {
  const meanReward = child.totalReward[exploringPlayer]! / child.visits;
  const exploration =
    C * Math.sqrt(Math.log(Math.max(1, child.availability)) / child.visits);
  return meanReward + exploration;
}
