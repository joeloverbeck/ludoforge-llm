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
import type { MctsSearchVisitor } from './visitor.js';
import type { MutableDiagnosticsAccumulator } from './diagnostics.js';
import type { CachedClassificationEntry, CachedLegalMoveInfo, ClassificationStatus } from './state-cache.js';
import { applyMove } from '../../kernel/apply-move.js';
import { terminalResult } from '../../kernel/terminal.js';
import { evaluateState } from '../evaluate-state.js';
import { nextInt } from '../../kernel/prng.js';
import { classifySingleMove } from './materialization.js';
import type { SingleMoveClassificationKind } from './materialization.js';
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
  visitor?: MctsSearchVisitor,
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
    try {
      const result = applyMove(def, state, candidate.move, undefined, runtime);
      const terminal = terminalResult(def, result.state, runtime);

      if (terminal !== null && isWinForPlayer(terminal, actingPlayer)) {
        scored.push({ index: i, score: Infinity, isTerminalWin: true });
      } else {
        const heuristic = evaluateState(def, result.state, actingPlayer, runtime);
        scored.push({ index: i, score: heuristic, isTerminalWin: false });
      }
    } catch (e: unknown) {
      // applyMove failed — score as worst possible candidate.
      scored.push({ index: i, score: -Infinity, isTerminalWin: false });
      if (visitor?.onEvent) {
        visitor.onEvent({
          type: 'applyMoveFailure',
          actionId: candidate.move.actionId,
          phase: 'expansion',
          error: String(e),
        });
      }
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

// ---------------------------------------------------------------------------
// Cheap frontier ordering (no applyMove / evaluate calls)
// ---------------------------------------------------------------------------

/**
 * A frontier entry pairs a CachedLegalMoveInfo (with its index in the
 * classification entry) with a cheap ordering score.
 */
export interface FrontierEntry {
  readonly info: CachedLegalMoveInfo;
  readonly infoIndex: number;
  readonly cheapScore: number;
}

/**
 * Build a cheaply-ordered frontier of unexpanded candidates.
 *
 * The ordering uses only game-agnostic, zero-cost signals:
 * - Previous root-best hint (highest priority)
 * - Terminal/proven-result info if already known (second priority)
 * - Stable PRNG tie-break (deterministic for same seed)
 *
 * This does NOT call `applyMove()` or `evaluate()`.
 *
 * @param classEntry    - incremental classification entry for the state
 * @param existingKeys  - set of moveKeys already expanded as children
 * @param rootBestKey   - optional moveKey of the current root best child
 * @param rng           - PRNG for deterministic tie-breaking
 * @returns Ordered frontier entries (highest score first) and consumed RNG.
 */
export function buildOrderedFrontier(
  classEntry: CachedClassificationEntry,
  existingKeys: ReadonlySet<string>,
  rootBestKey: MoveKey | null,
  rng: Rng,
): { readonly frontier: readonly FrontierEntry[]; readonly rng: Rng } {
  const entries: FrontierEntry[] = [];
  let currentRng = rng;

  for (let i = 0; i < classEntry.infos.length; i += 1) {
    const info = classEntry.infos[i]!;

    // Skip already-expanded candidates.
    if (existingKeys.has(info.moveKey)) continue;

    // Skip known-illegal or pendingStochastic.
    if (info.status === 'illegal' || info.status === 'pendingStochastic') continue;

    // Compute cheap score (higher = more promising).
    let score = 0;

    // Root-best hint: strongly prefer the previously best move.
    if (rootBestKey !== null && info.moveKey === rootBestKey) {
      score += 1000;
    }

    // Classified as ready is slightly preferred over unknown
    // (avoids paying for classification if a ready candidate is available).
    if (info.status === 'ready') {
      score += 10;
    } else if (info.status === 'pending') {
      score += 5;
    }
    // 'unknown' gets score += 0 (will be classified on demand).

    // Stable PRNG tie-break: add a small random value in [0, 1).
    const [tieVal, nextRng] = nextInt(currentRng, 0, 999);
    currentRng = nextRng;
    score += tieVal / 1000;

    entries.push({ info, infoIndex: i, cheapScore: score });
  }

  // Sort descending by cheapScore for deterministic ordering.
  entries.sort((a, b) => b.cheapScore - a.cheapScore);

  return { frontier: entries, rng: currentRng };
}

// ---------------------------------------------------------------------------
// Lazy expansion candidate selection
// ---------------------------------------------------------------------------

/**
 * Result of lazy expansion: the chosen candidate plus consumed RNG.
 * Returns `null` if no compatible candidate was found (all illegal or
 * frontier exhausted).
 */
export interface LazyExpansionResult {
  readonly candidate: ConcreteMoveCandidate;
  readonly rng: Rng;
}

/**
 * Select an expansion candidate using ordered lazy expansion.
 *
 * Unlike `selectExpansionCandidate()` which applies + evaluates ALL
 * candidates, this function:
 *
 * 1. Builds a cheap frontier order (no kernel calls).
 * 2. Walks the frontier, classifying `unknown` candidates on demand.
 * 3. Collects up to `shortlistSize` compatible (ready) candidates.
 * 4. Runs one-step `applyMove() + evaluate()` only on the shortlist.
 * 5. Returns the best shortlisted candidate.
 *
 * Falls back to exhaustive `selectExpansionCandidate()` when the
 * candidate count is below `exhaustiveThreshold`.
 *
 * @param classEntry          - incremental classification entry for the state
 * @param existingKeys        - set of moveKeys already expanded as children
 * @param rootBestKey         - optional moveKey hint from prior root best
 * @param shortlistSize       - max candidates to apply+evaluate (default 4)
 * @param exhaustiveThreshold - fall back to exhaustive when total candidates < this
 * @param def                 - game definition
 * @param state               - current game state
 * @param actingPlayer        - player making the move
 * @param rng                 - deterministic PRNG
 * @param runtime             - optional game def runtime
 * @param visitor             - optional search visitor
 * @param acc                 - optional diagnostics accumulator
 */
export function selectExpansionCandidateLazy(
  classEntry: CachedClassificationEntry,
  existingKeys: ReadonlySet<string>,
  rootBestKey: MoveKey | null,
  shortlistSize: number,
  exhaustiveThreshold: number,
  def: GameDef,
  state: GameState,
  actingPlayer: PlayerId,
  rng: Rng,
  runtime?: GameDefRuntime,
  visitor?: MctsSearchVisitor,
  acc?: MutableDiagnosticsAccumulator,
): LazyExpansionResult | null {
  // Count unexpanded candidates (not illegal/pendingStochastic).
  let unexpandedCount = 0;
  for (let i = 0; i < classEntry.infos.length; i += 1) {
    const info = classEntry.infos[i]!;
    if (existingKeys.has(info.moveKey)) continue;
    if (info.status === 'illegal' || info.status === 'pendingStochastic') continue;
    unexpandedCount += 1;
  }

  if (unexpandedCount === 0) {
    if (acc !== undefined) {
      acc.lazyExpansionFrontierExhausted += 1;
    }
    return null;
  }

  // Fall back to exhaustive for small candidate counts.
  if (unexpandedCount < exhaustiveThreshold) {
    if (acc !== undefined) {
      acc.lazyExpansionFallbackToExhaustive += 1;
    }
    // Collect all unexpanded ready candidates for exhaustive evaluation.
    const candidates: ConcreteMoveCandidate[] = [];
    for (let i = 0; i < classEntry.infos.length; i += 1) {
      const info = classEntry.infos[i]!;
      if (existingKeys.has(info.moveKey)) continue;

      // Classify unknown candidates since we're doing exhaustive anyway.
      if (info.status === 'unknown') {
        classifyNextCandidateAt(classEntry, i, def, state, runtime, visitor, acc);
        if (acc !== undefined) {
          acc.lazyExpansionCandidatesClassified += 1;
        }
      }

      if (info.status === 'ready') {
        candidates.push({ move: info.move, moveKey: info.moveKey });
      }
    }

    if (candidates.length === 0) {
      if (acc !== undefined) {
        acc.lazyExpansionFrontierExhausted += 1;
      }
      return null;
    }

    const result = selectExpansionCandidate(
      candidates, def, state, actingPlayer, rng, runtime, visitor,
    );
    return { candidate: result.candidate, rng: result.rng };
  }

  // ── Lazy path: ordered frontier + shortlist ──────────────────────
  const { frontier, rng: postFrontier } = buildOrderedFrontier(
    classEntry, existingKeys, rootBestKey, rng,
  );

  const shortlist: ConcreteMoveCandidate[] = [];
  let currentRng = postFrontier;
  let candidatesClassified = 0;

  for (const entry of frontier) {
    if (shortlist.length >= shortlistSize) break;

    const { info, infoIndex } = entry;

    // Classify unknown candidates on demand.
    if (info.status === 'unknown') {
      classifyNextCandidateAt(classEntry, infoIndex, def, state, runtime, visitor, acc);
      candidatesClassified += 1;
    }

    // After classification, check status.
    if (info.status === 'ready') {
      shortlist.push({ move: info.move, moveKey: info.moveKey });
    }
    // pending / illegal / pendingStochastic — skip for expansion
    // (pending moves get decision roots, not direct expansion).
  }

  if (acc !== undefined) {
    acc.lazyExpansionCandidatesClassified += candidatesClassified;
    acc.lazyExpansionShortlistSize += shortlist.length;
    if (shortlist.length === 0) {
      acc.lazyExpansionFrontierExhausted += 1;
    }
  }

  if (shortlist.length === 0) {
    return null;
  }

  // Single candidate — no need for expensive evaluation.
  if (shortlist.length === 1) {
    return { candidate: shortlist[0]!, rng: currentRng };
  }

  // Evaluate the shortlist with one-step applyMove + evaluate.
  const result = selectExpansionCandidate(
    shortlist, def, state, actingPlayer, currentRng, runtime, visitor,
  );
  return { candidate: result.candidate, rng: result.rng };
}

// ---------------------------------------------------------------------------
// Internal helper: classify a specific index in the classification entry
// ---------------------------------------------------------------------------

/**
 * Classify the move at a specific index in the classification entry.
 * Unlike `classifyNextCandidate` which advances the cursor, this
 * classifies at a specific position (used for on-demand lazy classification).
 */
function classifyNextCandidateAt(
  entry: CachedClassificationEntry,
  index: number,
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
  visitor?: MctsSearchVisitor,
  acc?: MutableDiagnosticsAccumulator,
): void {
  const info = entry.infos[index];
  if (info === undefined || info.status !== 'unknown') return;

  const kind = classifySingleMove(def, state, info.move, runtime, visitor, acc);
  info.status = kindToStatus(kind);

  // Advance cursor if this was the next-in-line.
  if (index === entry.nextUnclassifiedCursor) {
    entry.nextUnclassifiedCursor += 1;
    // Skip past any already-classified entries.
    while (
      entry.nextUnclassifiedCursor < entry.infos.length &&
      entry.infos[entry.nextUnclassifiedCursor]!.status !== 'unknown'
    ) {
      entry.nextUnclassifiedCursor += 1;
    }
    if (entry.nextUnclassifiedCursor >= entry.infos.length) {
      entry.exhaustiveScanComplete = true;
    }
  }
}

/** Map materialization result kind to ClassificationStatus. */
function kindToStatus(kind: SingleMoveClassificationKind): ClassificationStatus {
  switch (kind) {
    case 'complete': return 'ready';
    case 'pending': return 'pending';
    case 'illegal': return 'illegal';
    case 'pendingStochastic': return 'pendingStochastic';
    case 'error': return 'illegal';
    default: return 'illegal';
  }
}
