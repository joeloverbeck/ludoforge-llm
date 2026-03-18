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
 * Decision completion does NOT count toward the simulation cutoff budget.
 * The cutoff counts complete game plies, not mid-decision steps.
 *
 * @returns The post-decision state and consumed RNG on success, or
 *          `null` when completion fails (backpropagate loss).
 */
export function resolveDecisionBoundary(
  def: GameDef,
  state: GameState,
  partialMove: Move,
  rng: Rng,
  runtime?: GameDefRuntime,
  acc?: MutableDiagnosticsAccumulator,
): DecisionBoundaryResult | null {
  try {
    const result = completeTemplateMove(def, state, partialMove, rng, runtime);

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
