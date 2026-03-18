/**
 * Decision boundary resolution for MCTS search.
 *
 * When selection exits the tree at a decision node, the partial move has
 * some decisions filled by tree traversal and the rest need random
 * completion before simulation can begin. This module handles that
 * completion step.
 *
 * Extracted from rollout.ts (Phase 5, spec section 3.1) so that both
 * rollout and non-rollout evaluation paths can share the same logic
 * without pulling in the full rollout module.
 */

import type { GameDef, GameState, Move, Rng } from '../../kernel/types.js';
import type { GameDefRuntime } from '../../kernel/gamedef-runtime.js';
import type { MutableDiagnosticsAccumulator } from './diagnostics.js';
import type { MctsNode } from './node.js';
import { applyMove } from '../../kernel/apply-move.js';
import { completeTemplateMove } from '../../kernel/move-completion.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecisionBoundaryResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly move: Move;
}

// ---------------------------------------------------------------------------
// Intermediate chooseN stripping
// ---------------------------------------------------------------------------

/**
 * Strip in-progress chooseN bindings from a partial move's params.
 *
 * During tree traversal, chooseN decisions accumulate items incrementally
 * in `move.params[decisionKey]`. If selection exits the tree before the
 * chooseN is confirmed (i.e., at a non-confirm decision leaf), that
 * intermediate array must be removed before passing to
 * `completeTemplateMove`. Otherwise the template completion treats the
 * partial array as finalized and the kernel rejects the cardinality
 * mismatch at `applyMove` time.
 *
 * Walks up the parent chain from `leafNode` collecting all in-progress
 * chooseN bindings (those with `decisionType === 'chooseN'` that haven't
 * reached a confirm node).
 */
export function stripIncompleteChooseNBindings(
  partialMove: Move,
  leafNode: MctsNode,
): Move {
  // Collect in-progress chooseN bindings by walking up from the leaf.
  // A chooseN chain for binding $X looks like:
  //   stateNode → decisionRoot → chooseN-opt1($X) → chooseN-opt2($X) → leaf
  // All nodes in the chain have decisionType='chooseN' and
  // decisionBinding='$X'. We strip $X from params.
  const incompleteBindings = new Set<string>();
  let current: MctsNode | null = leafNode;

  while (current !== null && current.nodeKind === 'decision') {
    if (current.decisionType === 'chooseN' && current.decisionBinding !== null) {
      incompleteBindings.add(current.decisionBinding);
    }
    current = current.parent;
  }

  if (incompleteBindings.size === 0) {
    return partialMove;
  }

  // Strip incomplete bindings from main params.
  const cleanedParams = { ...partialMove.params };
  for (const binding of incompleteBindings) {
    delete cleanedParams[binding];
  }

  // Strip from compound specialActivity params if present.
  const compound = partialMove.compound;
  if (compound !== undefined && compound.specialActivity !== undefined) {
    const saParams = { ...compound.specialActivity.params };
    let saChanged = false;
    for (const binding of incompleteBindings) {
      if (binding in saParams) {
        delete saParams[binding];
        saChanged = true;
      }
    }
    if (saChanged) {
      return {
        ...partialMove,
        params: cleanedParams,
        compound: {
          ...compound,
          specialActivity: {
            ...compound.specialActivity,
            params: saParams,
          },
        },
      };
    }
  }

  return { ...partialMove, params: cleanedParams };
}

// ---------------------------------------------------------------------------
// Decision boundary resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a decision boundary by completing a partial move via random
 * decision completion, then applying the completed move.
 *
 * Called when selection exits the tree at a decision node — the partial
 * move has some decisions filled by tree traversal, and the rest need
 * random completion before simulation can begin.
 *
 * Before passing to `completeTemplateMove`, any in-progress chooseN
 * bindings are stripped from the partial move. This ensures the template
 * completion properly re-discovers the chooseN and makes a fresh random
 * selection with correct cardinality, rather than treating intermediate
 * accumulated arrays as finalized values.
 *
 * Decision completion does NOT count toward the simulation cutoff budget.
 * The cutoff counts complete game plies, not mid-decision steps.
 *
 * @param leafNode - the decision node where selection exited the tree
 * @returns The post-decision state and consumed RNG on success, or
 *          `null` when completion fails (backpropagate loss).
 */
export function resolveDecisionBoundary(
  def: GameDef,
  state: GameState,
  partialMove: Move,
  rng: Rng,
  leafNode: MctsNode,
  runtime?: GameDefRuntime,
  acc?: MutableDiagnosticsAccumulator,
): DecisionBoundaryResult | null {
  try {
    const cleanedMove = stripIncompleteChooseNBindings(partialMove, leafNode);
    const result = completeTemplateMove(def, state, cleanedMove, rng, runtime);

    if (result.kind !== 'completed') {
      if (acc !== undefined) {
        acc.decisionBoundaryFailures += 1;
      }
      return null;
    }

    const amStart = acc !== undefined ? performance.now() : 0;
    const applied = applyMove(def, state, result.move, undefined, runtime);
    if (acc !== undefined) {
      acc.applyMoveCalls += 1;
      acc.applyMoveTimeMs += performance.now() - amStart;
      acc.decisionCompletionsInRollout += 1;
      const tc = applied.triggerFirings.length;
      acc.totalTriggerFirings += tc;
      if (tc > acc.maxTriggerFiringsPerMove) acc.maxTriggerFiringsPerMove = tc;
    }
    return { state: applied.state, rng: result.rng, move: result.move };
  } catch {
    if (acc !== undefined) {
      acc.decisionBoundaryFailures += 1;
    }
    return null;
  }
}
