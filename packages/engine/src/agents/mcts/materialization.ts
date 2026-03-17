/**
 * Lazy template move materialization for MCTS search.
 *
 * Converts `legalMoves()` output (which may include template moves with
 * unresolved parameters) into concrete `ConcreteMoveCandidate`s suitable
 * for the open-loop search tree.  Templates are completed lazily — only
 * up to `limitPerTemplate` completions per template — and deduplicated
 * by `MoveKey`.
 */

import type { GameDef, GameState, Move, Rng } from '../../kernel/types.js';
import type { GameDefRuntime } from '../../kernel/gamedef-runtime.js';
import { legalChoicesEvaluate } from '../../kernel/legal-choices.js';
import { completeTemplateMove } from '../../kernel/move-completion.js';
import { canonicalMoveKey } from './move-key.js';
import type { ConcreteMoveCandidate } from './expansion.js';
import type { MctsSearchVisitor } from './visitor.js';
import type { MctsNode } from './node.js';
import type { MutableDiagnosticsAccumulator } from './diagnostics.js';

// ---------------------------------------------------------------------------
// MoveClassification
// ---------------------------------------------------------------------------

/**
 * Result of classifying legal moves by runtime readiness.
 *
 * - `ready`: moves with `legalChoicesEvaluate() → 'complete'` — can be applied directly.
 * - `pending`: moves with `legalChoicesEvaluate() → 'pending'` — need decision root nodes.
 */
export interface MoveClassification {
  readonly ready: readonly ConcreteMoveCandidate[];
  readonly pending: readonly Move[];
}

// ---------------------------------------------------------------------------
// classifyMovesForSearch
// ---------------------------------------------------------------------------

/**
 * Classify legal moves by runtime readiness using `legalChoicesEvaluate`.
 *
 * This is the sole move classification entry point for MCTS in-tree search.
 * All moves are evaluated against the current game state — no compile-time
 * shortcuts.
 *
 * Ready moves are deduplicated by `MoveKey`.  Pending moves are deduplicated
 * by `actionId` — unless they carry distinct initial params, in which case
 * they are deduplicated by `canonicalMoveKey`.
 *
 * Illegal and pendingStochastic moves are silently dropped.  Moves that throw
 * during classification are dropped with an optional visitor event.
 *
 * This function is **pure** — no RNG state consumed, no side effects beyond
 * visitor events.
 */
export function classifyMovesForSearch(
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
  runtime?: GameDefRuntime,
  visitor?: MctsSearchVisitor,
  acc?: MutableDiagnosticsAccumulator,
): MoveClassification {
  const ready: ConcreteMoveCandidate[] = [];
  const pending: Move[] = [];
  const seenReadyKeys = new Set<string>();
  const seenPendingKeys = new Set<string>();

  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i]!;

    let kind: string;
    try {
      const tStart = acc !== undefined ? performance.now() : 0;
      kind = legalChoicesEvaluate(def, state, move, undefined, runtime).kind;
      if (acc !== undefined) {
        acc.materializeTimeMs += performance.now() - tStart;
      }
    } catch {
      if (visitor?.onEvent) {
        visitor.onEvent({
          type: 'moveDropped',
          actionId: move.actionId,
          reason: 'unsatisfiable',
        });
      }
      continue;
    }

    switch (kind) {
      case 'complete': {
        const key = canonicalMoveKey(move);
        if (!seenReadyKeys.has(key)) {
          seenReadyKeys.add(key);
          ready.push({ move, moveKey: key });
        }
        break;
      }
      case 'pending': {
        // Deduplicate by actionId when params are empty, by canonicalMoveKey
        // when the move carries distinct initial params.
        const hasParams = Object.keys(move.params).length > 0;
        const dedupKey = hasParams ? canonicalMoveKey(move) : move.actionId;
        if (!seenPendingKeys.has(dedupKey)) {
          seenPendingKeys.add(dedupKey);
          pending.push(move);
        }
        break;
      }
      case 'illegal':
        // Silently skip.
        break;
      case 'pendingStochastic':
        if (visitor?.onEvent) {
          visitor.onEvent({
            type: 'moveDropped',
            actionId: move.actionId,
            reason: 'stochasticUnresolved',
          });
        }
        break;
      default:
        // Unknown kind — skip.
        break;
    }
  }

  return { ready, pending };
}

// ---------------------------------------------------------------------------
// classifySingleMove
// ---------------------------------------------------------------------------

/**
 * Classification result for a single move.
 *
 * - `complete`  → move is ready (fully parameterized, all preconditions met)
 * - `pending`   → move needs further decisions before it can be applied
 * - `illegal`   → move is not legal in the current state
 * - `pendingStochastic` → move requires stochastic resolution
 * - `error`     → classification threw an exception
 */
export type SingleMoveClassificationKind =
  | 'complete'
  | 'pending'
  | 'illegal'
  | 'pendingStochastic'
  | 'error';

/**
 * Classify a single move via `legalChoicesEvaluate`.
 *
 * Returns the classification kind. This is the atomic building block for
 * incremental per-move classification — callers classify one move at a time
 * instead of sweeping the entire move list.
 *
 * Pure function — no RNG consumed, no side effects beyond visitor events.
 */
export function classifySingleMove(
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
  visitor?: MctsSearchVisitor,
  acc?: MutableDiagnosticsAccumulator,
): SingleMoveClassificationKind {
  try {
    const tStart = acc !== undefined ? performance.now() : 0;
    const kind = legalChoicesEvaluate(def, state, move, undefined, runtime).kind;
    if (acc !== undefined) {
      acc.materializeTimeMs += performance.now() - tStart;
    }
    return kind as SingleMoveClassificationKind;
  } catch {
    if (visitor?.onEvent) {
      visitor.onEvent({
        type: 'moveDropped',
        actionId: move.actionId,
        reason: 'unsatisfiable',
      });
    }
    return 'error';
  }
}

// ---------------------------------------------------------------------------
// materializeMovesForRollout
// ---------------------------------------------------------------------------

/**
 * Materialize moves for rollout simulation.
 *
 * Ready moves (`legalChoicesEvaluate → 'complete'`) pass through as-is.
 * Pending moves (`legalChoicesEvaluate → 'pending'`) are completed via
 * `completeTemplateMove()` (random parameter filling) up to
 * `limitPerTemplate` attempts per move.  This is the correct behavior
 * for the simulation phase where we don't build decision tree nodes.
 *
 * Illegal and pendingStochastic moves are dropped.  Moves that throw
 * during classification are dropped with an optional visitor event.
 *
 * All candidates are deduplicated by `MoveKey`.
 */
export function materializeMovesForRollout(
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
  rng: Rng,
  limitPerTemplate: number,
  runtime?: GameDefRuntime,
  visitor?: MctsSearchVisitor,
  acc?: MutableDiagnosticsAccumulator,
): { readonly candidates: readonly ConcreteMoveCandidate[]; readonly rng: Rng } {
  const candidates: ConcreteMoveCandidate[] = [];
  const seenKeys = new Set<string>();
  let cursor: Rng = rng;

  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i]!;

    // Classify every move via legalChoicesEvaluate — no compile-time shortcuts.
    let kind: string;
    try {
      const tStart = acc !== undefined ? performance.now() : 0;
      kind = legalChoicesEvaluate(def, state, move, undefined, runtime).kind;
      if (acc !== undefined) {
        acc.materializeTimeMs += performance.now() - tStart;
      }
    } catch {
      if (visitor?.onEvent) {
        visitor.onEvent({
          type: 'moveDropped',
          actionId: move.actionId,
          reason: 'unsatisfiable',
        });
      }
      continue;
    }

    switch (kind) {
      case 'complete': {
        const key = canonicalMoveKey(move);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          candidates.push({ move, moveKey: key });
        }
        break;
      }
      case 'pending': {
        // Complete via random parameter filling, up to limitPerTemplate attempts.
        for (let attempt = 0; attempt < limitPerTemplate; attempt += 1) {
          if (acc !== undefined) acc.templateCompletionAttempts += 1;
          const result = completeTemplateMove(def, state, move, cursor, runtime);

          if (result.kind === 'completed') {
            if (acc !== undefined) acc.templateCompletionSuccesses += 1;
            cursor = result.rng;
            const key = canonicalMoveKey(result.move);
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              candidates.push({ move: result.move, moveKey: key });
            }
          } else if (result.kind === 'stochasticUnresolved') {
            if (acc !== undefined) acc.templateCompletionFailures += 1;
            // Consume RNG for determinism but do NOT add as candidate.
            cursor = result.rng;
            if (visitor?.onEvent) {
              visitor.onEvent({
                type: 'moveDropped',
                actionId: move.actionId,
                reason: 'stochasticUnresolved',
              });
            }
            break;
          } else {
            if (acc !== undefined) acc.templateCompletionFailures += 1;
            // unsatisfiable — no further attempts will succeed.
            if (visitor?.onEvent) {
              visitor.onEvent({
                type: 'moveDropped',
                actionId: move.actionId,
                reason: 'unsatisfiable',
              });
            }
            break;
          }
        }
        break;
      }
      case 'illegal':
        // Silently skip.
        break;
      case 'pendingStochastic':
        if (visitor?.onEvent) {
          visitor.onEvent({
            type: 'moveDropped',
            actionId: move.actionId,
            reason: 'stochasticUnresolved',
          });
        }
        break;
      default:
        // Unknown kind — skip.
        break;
    }
  }

  return { candidates, rng: cursor };
}

// ---------------------------------------------------------------------------
// filterAvailableCandidates
// ---------------------------------------------------------------------------

/**
 * Filter candidates to only those whose `moveKey` does not already appear
 * as a child of the given node.
 *
 * @param node       - the MCTS node to check children of
 * @param candidates - the full candidate list
 * @returns candidates not yet expanded as children
 */
export function filterAvailableCandidates(
  node: MctsNode,
  candidates: readonly ConcreteMoveCandidate[],
): readonly ConcreteMoveCandidate[] {
  if (node.children.length === 0) {
    return candidates;
  }

  const childKeys = new Set<string>();
  for (let i = 0; i < node.children.length; i += 1) {
    const child = node.children[i]!;
    if (child.moveKey !== null) {
      childKeys.add(child.moveKey);
    }
  }

  return candidates.filter((c) => !childKeys.has(c.moveKey));
}
