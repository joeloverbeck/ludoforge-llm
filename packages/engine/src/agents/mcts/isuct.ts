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
 * @param heuristicBackupAlpha - blending weight for heuristic prior (0 = pure MC)
 * @returns the selected child node
 * @throws if `availableChildren` is empty
 */
export function selectChild(
  _node: MctsNode,
  exploringPlayer: PlayerId,
  explorationConstant: number,
  availableChildren: readonly MctsNode[],
  heuristicBackupAlpha: number = 0,
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
  let bestScore = isuctScore(bestChild, exploringPlayer, explorationConstant, heuristicBackupAlpha);

  for (let i = 1; i < availableChildren.length; i++) {
    const child: MctsNode = availableChildren[i]!;
    const score = isuctScore(child, exploringPlayer, explorationConstant, heuristicBackupAlpha);
    if (score > bestScore) {
      bestScore = score;
      bestChild = child;
    }
  }

  return bestChild;
}

// ---------------------------------------------------------------------------
// Standard UCT for decision nodes
// ---------------------------------------------------------------------------

/**
 * Select the best child from a decision node using standard UCT.
 *
 * Decision nodes use `parent.visits` in the exploration denominator (not
 * `child.availability`) because decision options are always fully visible
 * to the deciding player — there is no hidden information at the decision
 * level.
 *
 * Heuristic backup is not applied: decision nodes always have
 * `heuristicPrior === null`.
 *
 * @param parent              - the decision node whose children we select from
 * @param exploringPlayer     - the player whose reward we maximise
 * @param explorationConstant - C parameter balancing exploitation/exploration
 * @param children            - children to select from
 * @returns the selected child node
 * @throws if `children` is empty
 */
export function selectDecisionChild(
  parent: MctsNode,
  exploringPlayer: PlayerId,
  explorationConstant: number,
  children: readonly MctsNode[],
): MctsNode {
  if (children.length === 0) {
    throw new Error(
      'selectDecisionChild: no children — cannot select from empty list',
    );
  }

  // Prefer unvisited children for expansion.
  for (const child of children) {
    if (child.visits === 0) {
      return child;
    }
  }

  // All visited — compute standard UCT scores.
  let bestChild: MctsNode = children[0]!;
  let bestScore = standardUctScore(
    bestChild, parent.visits, exploringPlayer, explorationConstant,
  );

  for (let i = 1; i < children.length; i++) {
    const child: MctsNode = children[i]!;
    const score = standardUctScore(
      child, parent.visits, exploringPlayer, explorationConstant,
    );
    if (score > bestScore) {
      bestScore = score;
      bestChild = child;
    }
  }

  return bestChild;
}

function standardUctScore(
  child: MctsNode,
  parentVisits: number,
  exploringPlayer: PlayerId,
  C: number,
): number {
  const exploitation = child.totalReward[exploringPlayer]! / child.visits;
  const exploration =
    C * Math.sqrt(Math.log(Math.max(1, parentVisits)) / child.visits);
  return exploitation + exploration;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function isuctScore(
  child: MctsNode,
  exploringPlayer: PlayerId,
  C: number,
  alpha: number,
): number {
  const mcMean = child.totalReward[exploringPlayer]! / child.visits;

  // Blend MC mean with heuristic prior when alpha > 0 and prior exists.
  const exploitation =
    alpha > 0 && child.heuristicPrior !== null
      ? (1 - alpha) * mcMean + alpha * child.heuristicPrior[exploringPlayer]!
      : mcMean;

  const exploration =
    C * Math.sqrt(Math.log(Math.max(1, child.availability)) / child.visits);
  return exploitation + exploration;
}
