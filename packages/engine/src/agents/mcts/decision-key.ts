/**
 * MoveKey generation for decision nodes in the MCTS search tree.
 *
 * Decision keys are prefixed with `D:` to distinguish them from concrete
 * move keys produced by `canonicalMoveKey()`.
 */

import type { MoveKey } from './move-key.js';

/**
 * Produce a deterministic key for a decision node that encodes the action,
 * binding name, and chosen binding value.
 *
 * Format: `D:<actionId>:<bindingName>=<value>`
 */
export function decisionNodeKey(
  actionId: string,
  bindingName: string,
  bindingValue: string,
): MoveKey {
  return `D:${actionId}:${bindingName}=${bindingValue}`;
}

/**
 * Produce a key for a template decision root node that encodes only the
 * action category. All decision subtrees for the same action share UCB
 * statistics at this root level.
 *
 * Format: `D:<actionId>`
 */
export function templateDecisionRootKey(actionId: string): MoveKey {
  return `D:${actionId}`;
}
