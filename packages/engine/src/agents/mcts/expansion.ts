/**
 * Progressive widening and expansion priority for MCTS.
 *
 * Progressive widening limits how many children a node admits over time,
 * preventing the tree from becoming too wide too early.  Expansion priority
 * provides a cheap, game-agnostic competence boost by preferring terminal
 * wins and heuristically strong moves.
 */

import type { Move } from '../../kernel/types-core.js';
import type { GameDef, GameState } from '../../kernel/types.js';
import type { GameDefRuntime } from '../../kernel/gamedef-runtime.js';
import type { PlayerId } from '../../kernel/branded.js';
import type { Rng } from '../../kernel/types-core.js';
import type { MoveKey } from './move-key.js';
import { applyMove } from '../../kernel/apply-move.js';
import { terminalResult } from '../../kernel/terminal.js';
import { evaluateState } from '../evaluate-state.js';
import { nextInt } from '../../kernel/prng.js';
import type { MctsNode } from './node.js';

// ---------------------------------------------------------------------------
// ConcreteMoveCandidate (shared with materialization — ticket 007)
// ---------------------------------------------------------------------------

/**
 * A fully concrete move paired with its canonical key for deduplication.
 * Defined here as the first consumer; ticket 007 (materialization) will
 * import from this module.
 */
export interface ConcreteMoveCandidate {
  readonly move: Move;
  readonly moveKey: MoveKey;
}

// ---------------------------------------------------------------------------
// Progressive widening
// ---------------------------------------------------------------------------

/**
 * Maximum children a node may have given its visit count.
 *
 * Formula: `max(1, floor(K * visits^alpha))`
 *
 * @param visits - number of completed simulations through the node
 * @param K      - widening constant (default 2.0)
 * @param alpha  - widening exponent in (0, 1] (default 0.5)
 */
export function maxChildren(visits: number, K: number, alpha: number): number {
  return Math.max(1, Math.floor(K * Math.pow(visits, alpha)));
}

/**
 * Pure predicate: should the node accept another child?
 *
 * Returns `true` when the node has fewer children than the progressive
 * widening limit for its current visit count.
 */
export function shouldExpand(node: MctsNode, K: number, alpha: number): boolean {
  return node.children.length < maxChildren(node.visits, K, alpha);
}

// ---------------------------------------------------------------------------
// Expansion priority
// ---------------------------------------------------------------------------

interface ScoredCandidate {
  readonly index: number;
  readonly score: number;
  readonly isTerminalWin: boolean;
}

/**
 * Select the best expansion candidate using the priority:
 *
 * 1. Immediate terminal win for acting player.
 * 2. Highest one-step heuristic (`evaluateState`) score.
 * 3. PRNG tiebreak among equal scores.
 *
 * The function applies each candidate move to the state, checks for
 * terminal wins, and scores non-terminal states heuristically.  It never
 * calls `applyMove` more than `candidates.length` times (invariant 3).
 */
export function selectExpansionCandidate(
  candidates: readonly ConcreteMoveCandidate[],
  def: GameDef,
  state: GameState,
  actingPlayer: PlayerId,
  rng: Rng,
  runtime?: GameDefRuntime,
): { readonly candidate: ConcreteMoveCandidate; readonly rng: Rng } {
  if (candidates.length === 0) {
    throw new Error('selectExpansionCandidate called with empty candidates');
  }

  if (candidates.length === 1) {
    return { candidate: candidates[0]!, rng };
  }

  // Score each candidate: apply, check terminal, evaluate heuristic.
  const scored: ScoredCandidate[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i]!;
    const result = applyMove(def, state, candidate.move, undefined, runtime);
    const terminal = terminalResult(def, result.state, runtime);

    if (terminal !== null && isWinForPlayer(terminal, actingPlayer)) {
      scored.push({ index: i, score: Infinity, isTerminalWin: true });
    } else {
      const heuristic = evaluateState(def, result.state, actingPlayer, runtime);
      scored.push({ index: i, score: heuristic, isTerminalWin: false });
    }
  }

  // Priority 1: terminal wins
  const terminalWins = scored.filter((s) => s.isTerminalWin);
  if (terminalWins.length > 0) {
    const [tieIdx, rng2] = breakTie(terminalWins.length, rng);
    return { candidate: candidates[terminalWins[tieIdx]!.index]!, rng: rng2 };
  }

  // Priority 2: highest heuristic, tie broken by PRNG
  const bestScore = scored.reduce((max, s) => Math.max(max, s.score), -Infinity);
  const bestCandidates = scored.filter((s) => s.score === bestScore);
  const [tieIdx, rng2] = breakTie(bestCandidates.length, rng);
  return { candidate: candidates[bestCandidates[tieIdx]!.index]!, rng: rng2 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isWinForPlayer(
  terminal: NonNullable<ReturnType<typeof terminalResult>>,
  player: PlayerId,
): boolean {
  if (terminal.type === 'win') {
    return terminal.player === player;
  }
  if (terminal.type === 'score') {
    const top = terminal.ranking[0];
    return top !== undefined && top.player === player;
  }
  return false;
}

function breakTie(count: number, rng: Rng): readonly [number, Rng] {
  if (count === 1) {
    return [0, rng] as const;
  }
  return nextInt(rng, 0, count - 1);
}
