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
import type { MctsNode } from './node.js';

// ---------------------------------------------------------------------------
// materializeConcreteCandidates
// ---------------------------------------------------------------------------

/**
 * Materialize concrete move candidates from a list of (possibly template)
 * legal moves.
 *
 * Rules:
 * 1. Non-template (fully concrete) moves are yielded as-is with computed moveKey.
 * 2. Template moves are completed up to `limitPerTemplate` times, collecting
 *    unique `MoveKey`s.
 * 3. `stochasticUnresolved` results are included as candidates.
 * 4. `unsatisfiable` results are skipped.
 * 5. All candidates are deduplicated by `MoveKey` (first occurrence wins).
 * 6. The input `legalMoves` array is never mutated.
 *
 * @param def              - game definition
 * @param state            - current game state
 * @param legalMoves       - legal moves (may include templates)
 * @param rng              - search RNG (consumed for template completion randomness)
 * @param limitPerTemplate - max completions to sample per template move
 * @param runtime          - optional pre-built runtime for performance
 */
export function materializeConcreteCandidates(
  def: GameDef,
  state: GameState,
  legalMoves: readonly Move[],
  rng: Rng,
  limitPerTemplate: number,
  runtime?: GameDefRuntime,
): { readonly candidates: readonly ConcreteMoveCandidate[]; readonly rng: Rng } {
  const candidates: ConcreteMoveCandidate[] = [];
  const seenKeys = new Set<string>();
  let cursor: Rng = rng;

  for (let i = 0; i < legalMoves.length; i += 1) {
    const move = legalMoves[i]!;

    // Determine if the move is a template by checking for pending decisions.
    let choiceKind: string;
    try {
      choiceKind = legalChoicesEvaluate(def, state, move, undefined, runtime).kind;
    } catch {
      // If legalChoicesEvaluate throws (e.g. unknown action), treat as
      // unsatisfiable and skip.
      continue;
    }

    // If the move is illegal according to legalChoicesEvaluate, skip it.
    if (choiceKind === 'illegal') {
      continue;
    }

    if (choiceKind !== 'pending') {
      // Concrete move — yield as-is (deduplicated).
      const key = canonicalMoveKey(move);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        candidates.push({ move, moveKey: key });
      }
      continue;
    }

    // Template move — complete up to limitPerTemplate times.
    for (let attempt = 0; attempt < limitPerTemplate; attempt += 1) {
      const result = completeTemplateMove(def, state, move, cursor, runtime);

      if (result.kind === 'completed') {
        cursor = result.rng;
        const key = canonicalMoveKey(result.move);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          candidates.push({ move: result.move, moveKey: key });
        }
      } else if (result.kind === 'stochasticUnresolved') {
        cursor = result.rng;
        const key = canonicalMoveKey(result.move);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          candidates.push({ move: result.move, moveKey: key });
        }
        // Stop after first stochastic result for this template — further
        // completions won't resolve the stochastic gate differently.
        break;
      } else {
        // unsatisfiable — no further attempts will succeed.
        break;
      }
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
