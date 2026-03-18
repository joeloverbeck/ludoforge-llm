/**
 * MCTS agent — wraps the search loop in a class implementing the `Agent`
 * interface.  Handles RNG isolation, runtime building, single-move
 * short-circuit, and root decision selection.
 */

import type { Agent, Move, Rng } from '../../kernel/types.js';
import type { GameDefRuntime } from '../../kernel/gamedef-runtime.js';
import type { PlayerId } from '../../kernel/branded.js';
import type { MctsConfig, FallbackPolicy, MctsBudgetProfile } from './config.js';
import { validateMctsConfig, BUDGET_PROFILE_NAMES, resolveBudgetProfile } from './config.js';
import { createGameDefRuntime } from '../../kernel/gamedef-runtime.js';
import { fork, nextInt } from '../../kernel/prng.js';
import { derivePlayerObservation } from '../../kernel/observation.js';
import { createRootNode } from './node.js';
import type { MctsNode } from './node.js';
import { createNodePool } from './node-pool.js';
import { runSearch, selectRootDecision } from './search.js';
import { legalChoicesEvaluate } from '../../kernel/legal-choices.js';
import { completeTemplateMove } from '../../kernel/move-completion.js';
import { selectStochasticFallback } from '../agent-move-selection.js';
import { evaluateForAllPlayers } from './evaluate.js';
import { familyKey } from './move-key.js';
import { applyMove } from '../../kernel/apply-move.js';
import {
  splitSearchBudget, forkWorkerRngs, extractRootChildInfos,
  mergeRootResults, selectBestMergedChild,
  type WorkerRootChildInfo,
} from './parallel.js';

// ---------------------------------------------------------------------------
// Post-completion: ensure the selected move is fully resolved
// ---------------------------------------------------------------------------

/**
 * Verify that the MCTS-selected move is fully complete against the *real*
 * game state.  If the best child's move still has pending decisions (e.g.
 * from stochastic resolution during search), attempt completion.
 *
 * Fallback chain:
 * 1. Fast-path: `legalChoicesEvaluate` says the move is complete → return.
 * 2. Try `completeTemplateMove` on the best child's move.
 * 3. Try siblings in descending visit-count order.
 * 4. Fall back to `completeTemplateMove` on original legal moves.
 * 5. Last resort: `selectStochasticFallback` on stochastic completions.
 */
export function postCompleteSelectedMove(
  def: Parameters<Agent['chooseMove']>[0]['def'],
  state: Parameters<Agent['chooseMove']>[0]['state'],
  root: MctsNode,
  bestChild: MctsNode,
  legalMovesList: readonly Move[],
  rng: Rng,
  runtime: GameDefRuntime,
): { readonly move: Move; readonly rng: Rng } {
  let cursor: Rng = rng;

  // 0. Decision root: follow highest-visit path through decision subtree.
  if (bestChild.nodeKind === 'decision') {
    // Walk down the subtree following highest-visit children.
    let current: MctsNode = bestChild;
    while (current.children.length > 0) {
      let bestVisitChild = current.children[0]!;
      for (let i = 1; i < current.children.length; i += 1) {
        if (current.children[i]!.visits > bestVisitChild.visits) {
          bestVisitChild = current.children[i]!;
        }
      }
      current = bestVisitChild;
    }

    // Use the deepest node's move (partial or complete).
    const deepestMove = current.partialMove ?? current.move;

    if (deepestMove !== null) {
      // If we landed on a state node, the move is fully resolved.
      if (current.nodeKind === 'state') {
        try {
          const choiceResult = legalChoicesEvaluate(def, state, deepestMove, undefined, runtime);
          if (choiceResult.kind !== 'pending' && choiceResult.kind !== 'illegal') {
            return { move: deepestMove, rng: cursor };
          }
        } catch {
          // Fall through to completion attempt.
        }
      }

      // Complete remaining decisions via fast random completion.
      try {
        const result = completeTemplateMove(def, state, deepestMove, cursor, runtime);
        if (result.kind === 'completed') {
          return { move: result.move, rng: result.rng };
        }
        if (result.kind === 'stochasticUnresolved') {
          cursor = result.rng;
        }
      } catch {
        // Fall through to original template move completion.
      }
    }

    // Fall back: try completing the original template move (bestChild.move).
    const templateMove = bestChild.move as Move;
    try {
      const result = completeTemplateMove(def, state, templateMove, cursor, runtime);
      if (result.kind === 'completed') {
        return { move: result.move, rng: result.rng };
      }
      if (result.kind === 'stochasticUnresolved') {
        cursor = result.rng;
      }
    } catch {
      // Fall through to sibling/legal-move fallback below.
    }
  }

  const bestMove = bestChild.move as Move;

  // 1. Fast-path: check if the move is already complete.
  try {
    const choiceResult = legalChoicesEvaluate(def, state, bestMove, undefined, runtime);
    if (choiceResult.kind !== 'pending' && choiceResult.kind !== 'illegal') {
      return { move: bestMove, rng: cursor };
    }
  } catch {
    // Fall through to completion attempts.
  }

  // 2. Try completing the best child's move against the real state.
  try {
    const result = completeTemplateMove(def, state, bestMove, cursor, runtime);
    if (result.kind === 'completed') {
      return { move: result.move, rng: result.rng };
    }
    if (result.kind === 'stochasticUnresolved') {
      cursor = result.rng;
    }
  } catch {
    // Move is invalid against real state (e.g. unknown action) — fall through to siblings.
  }

  // 3. Try siblings in descending visit-count order.
  const siblings = [...root.children]
    .filter((c) => c !== bestChild && c.move !== null)
    .sort((a, b) => b.visits - a.visits);

  for (const sibling of siblings) {
    const siblingMove = sibling.move as Move;
    // Check if sibling is directly complete.
    try {
      const choiceResult = legalChoicesEvaluate(def, state, siblingMove, undefined, runtime);
      if (choiceResult.kind !== 'pending' && choiceResult.kind !== 'illegal') {
        return { move: siblingMove, rng: cursor };
      }
    } catch {
      // Skip this sibling for direct check — try completion below.
    }
    // Try completing the sibling.
    try {
      const result = completeTemplateMove(def, state, siblingMove, cursor, runtime);
      if (result.kind === 'completed') {
        return { move: result.move, rng: result.rng };
      }
      if (result.kind === 'stochasticUnresolved') {
        cursor = result.rng;
      }
    } catch {
      // Sibling also invalid (e.g. unknown action) — try next.
    }
  }

  // 4. Fall back to RandomAgent-style completion of original legal moves.
  const completedMoves: Move[] = [];
  const stochasticMoves: Move[] = [];

  for (const move of legalMovesList) {
    const result = completeTemplateMove(def, state, move, cursor, runtime);
    if (result.kind === 'completed') {
      completedMoves.push(result.move);
      cursor = result.rng;
    } else if (result.kind === 'stochasticUnresolved') {
      stochasticMoves.push(result.move);
      cursor = result.rng;
    }
  }

  if (completedMoves.length > 0) {
    return { move: completedMoves[0]!, rng: cursor };
  }

  // 5. Last resort: stochastic fallback.
  if (stochasticMoves.length > 0) {
    return selectStochasticFallback(stochasticMoves, cursor);
  }

  // Should not happen if legalMoves was non-empty, but be safe.
  return { move: bestMove, rng: cursor };
}

// ---------------------------------------------------------------------------
// Fallback policies (spec section 3.11)
// ---------------------------------------------------------------------------

/** Default shortlist size for sampledOnePly and flatMonteCarlo fallbacks. */
const FALLBACK_SHORTLIST_SIZE = 8;

/**
 * `policyOnly`: return the move with the highest heuristic score without
 * running any search iterations.  Reuses family-ordering logic by grouping
 * moves by family and picking one representative per family before scoring.
 */
export function fallbackPolicyOnly(
  def: Parameters<Agent['chooseMove']>[0]['def'],
  state: Parameters<Agent['chooseMove']>[0]['state'],
  playerId: PlayerId,
  legalMoves: readonly Move[],
  rng: Rng,
  runtime: GameDefRuntime,
  temperature: number,
): { readonly move: Move; readonly rng: Rng } {
  // Group by family — pick one representative per family.
  const familyReps = new Map<string, Move>();
  for (const move of legalMoves) {
    const fk = familyKey(move);
    if (!familyReps.has(fk)) {
      familyReps.set(fk, move);
    }
  }
  const candidates = [...familyReps.values()];

  // Score each candidate with the heuristic evaluator.
  let bestMove = candidates[0]!;
  let bestScore = -Infinity;
  for (const move of candidates) {
    try {
      const result = applyMove(def, state, move, undefined, runtime);
      const rewards = evaluateForAllPlayers(def, result.state, temperature, runtime);
      const score = rewards[playerId] ?? 0;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    } catch {
      // Move application failed — skip this candidate.
    }
  }

  return { move: bestMove, rng };
}

/**
 * `sampledOnePly`: evaluate a random sample of moves via one-step
 * applyMove + evaluate and return the best.
 */
export function fallbackSampledOnePly(
  def: Parameters<Agent['chooseMove']>[0]['def'],
  state: Parameters<Agent['chooseMove']>[0]['state'],
  playerId: PlayerId,
  legalMoves: readonly Move[],
  rng: Rng,
  runtime: GameDefRuntime,
  temperature: number,
  shortlistSize: number = FALLBACK_SHORTLIST_SIZE,
): { readonly move: Move; readonly rng: Rng } {
  // Sample a shortlist from legal moves using Fisher-Yates partial shuffle.
  const indices = Array.from({ length: legalMoves.length }, (_, i) => i);
  let cursor: Rng = rng;
  const sampleCount = Math.min(shortlistSize, legalMoves.length);

  for (let i = 0; i < sampleCount; i += 1) {
    const [j, nextRng] = nextInt(cursor, i, indices.length - 1);
    cursor = nextRng;
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }

  const shortlist = indices.slice(0, sampleCount).map((idx) => legalMoves[idx]!);

  // Evaluate each shortlisted move.
  let bestMove = shortlist[0]!;
  let bestScore = -Infinity;
  for (const move of shortlist) {
    try {
      const result = applyMove(def, state, move, undefined, runtime);
      const rewards = evaluateForAllPlayers(def, result.state, temperature, runtime);
      const score = rewards[playerId] ?? 0;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    } catch {
      // Move application failed — skip this candidate.
    }
  }

  return { move: bestMove, rng: cursor };
}

/**
 * `flatMonteCarlo`: uniform random playouts over a small shortlist.
 * For each shortlisted move, run a shallow random playout and pick
 * the move with the best average reward.
 */
export function fallbackFlatMonteCarlo(
  def: Parameters<Agent['chooseMove']>[0]['def'],
  state: Parameters<Agent['chooseMove']>[0]['state'],
  playerId: PlayerId,
  legalMoves: readonly Move[],
  rng: Rng,
  runtime: GameDefRuntime,
  temperature: number,
  shortlistSize: number = FALLBACK_SHORTLIST_SIZE,
): { readonly move: Move; readonly rng: Rng } {
  // Reuse sampledOnePly — flat MC with depth 1 is equivalent to
  // one-step evaluation when the heuristic is the terminal evaluator.
  // For deeper playouts we would need the rollout machinery, but this
  // fallback is intentionally shallow to stay within budget.
  return fallbackSampledOnePly(
    def, state, playerId, legalMoves, rng, runtime, temperature, shortlistSize,
  );
}

/**
 * Dispatch to the appropriate fallback policy.
 * Returns `null` if `fallbackPolicy` is `'none'` (no fallback requested).
 */
export function dispatchFallback(
  policy: FallbackPolicy | undefined,
  def: Parameters<Agent['chooseMove']>[0]['def'],
  state: Parameters<Agent['chooseMove']>[0]['state'],
  playerId: PlayerId,
  legalMoves: readonly Move[],
  rng: Rng,
  runtime: GameDefRuntime,
  temperature: number,
): { readonly move: Move; readonly rng: Rng } | null {
  switch (policy) {
    case undefined:
    case 'none':
      return null;
    case 'policyOnly':
      return fallbackPolicyOnly(def, state, playerId, legalMoves, rng, runtime, temperature);
    case 'sampledOnePly':
      return fallbackSampledOnePly(def, state, playerId, legalMoves, rng, runtime, temperature);
    case 'flatMonteCarlo':
      return fallbackFlatMonteCarlo(def, state, playerId, legalMoves, rng, runtime, temperature);
  }
}

// ---------------------------------------------------------------------------
// MctsAgent
// ---------------------------------------------------------------------------

export class MctsAgent implements Agent {
  readonly config: MctsConfig;

  constructor(configOrProfile: MctsBudgetProfile | Partial<MctsConfig> = {}) {
    if (typeof configOrProfile === 'string') {
      if (!(BUDGET_PROFILE_NAMES as readonly string[]).includes(configOrProfile)) {
        throw new Error(
          `Unknown budget profile: "${configOrProfile}". `
          + `Allowed: ${BUDGET_PROFILE_NAMES.join(', ')}`,
        );
      }
      this.config = resolveBudgetProfile(configOrProfile as MctsBudgetProfile);
    } else {
      this.config = validateMctsConfig(configOrProfile);
    }
  }

  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    const { def, state, playerId, legalMoves, rng } = input;

    if (legalMoves.length === 0) {
      throw new Error('MctsAgent.chooseMove called with empty legalMoves');
    }

    // Single-move short-circuit — no search needed.
    if (legalMoves.length === 1) {
      return { move: legalMoves[0]!, rng };
    }

    // Build or reuse runtime.
    const runtime: GameDefRuntime = input.runtime ?? createGameDefRuntime(def);

    // Fork RNG: one for search (consumed internally), one for the caller.
    const [searchRng, nextAgentRng]: readonly [Rng, Rng] = fork(rng);

    // Derive observation for belief sampling.
    const observation = derivePlayerObservation(def, state, playerId as PlayerId);

    const workerCount = this.config.parallelWorkers ?? 1;
    const depthMultiplier = this.config.decisionDepthMultiplier ?? 4;

    // ── Parallel search path (parallelWorkers > 1) ───────────────────────
    if (workerCount > 1) {
      const budgets = splitSearchBudget(this.config.iterations, workerCount);
      const workerRngs = forkWorkerRngs(searchRng, workerCount);
      const workerRoots: MctsNode[] = [];
      const workerChildInfos: (readonly WorkerRootChildInfo[])[] = [];

      for (let w = 0; w < workerCount; w += 1) {
        const workerRoot = createRootNode(state.playerCount);
        const workerConfig = { ...this.config, iterations: budgets[w]! };
        const poolCapacity = Math.max(
          workerConfig.iterations * depthMultiplier + 1,
          legalMoves.length * 4,
        );
        const pool = createNodePool(poolCapacity, state.playerCount);

        runSearch(
          workerRoot, def, state, observation, playerId as PlayerId,
          validateMctsConfig(workerConfig),
          workerRngs[w]!, legalMoves, runtime, pool,
        );

        workerRoots.push(workerRoot);
        workerChildInfos.push(extractRootChildInfos(workerRoot));
      }

      const merged = mergeRootResults(workerChildInfos, state.playerCount);

      // Fallback check on merged visits.
      const fallbackPolicy = this.config.fallbackPolicy;
      if (fallbackPolicy && fallbackPolicy !== 'none' && merged.totalVisits <= 1) {
        const fallbackResult = dispatchFallback(
          fallbackPolicy, def, state, playerId as PlayerId,
          legalMoves, nextAgentRng, runtime, this.config.heuristicTemperature,
        );
        if (fallbackResult !== null) {
          return fallbackResult;
        }
      }

      // Select best moveKey from merged results.
      const bestMerged = selectBestMergedChild(merged, playerId as PlayerId);

      // Find the corresponding child node from any worker root for
      // post-completion (we need a real MctsNode with move data).
      let bestChild: MctsNode | null = null;
      let bestChildRoot: MctsNode = workerRoots[0]!;
      for (const workerRoot of workerRoots) {
        for (const child of workerRoot.children) {
          if (child.moveKey === bestMerged.moveKey) {
            if (bestChild === null || child.visits > bestChild.visits) {
              bestChild = child;
              bestChildRoot = workerRoot;
            }
          }
        }
      }

      if (bestChild === null) {
        // Should not happen if merge was correct, but be safe.
        bestChildRoot = workerRoots[0]!;
        bestChild = selectRootDecision(bestChildRoot, playerId as PlayerId);
      }

      return postCompleteSelectedMove(
        def, state, bestChildRoot, bestChild,
        legalMoves, nextAgentRng, runtime,
      );
    }

    // ── Single-threaded search path ──────────────────────────────────────
    const root = createRootNode(state.playerCount);
    const poolCapacity = Math.max(
      this.config.iterations * depthMultiplier + 1,
      legalMoves.length * 4,
    );
    const pool = createNodePool(poolCapacity, state.playerCount);

    // Run MCTS search.
    runSearch(
      root,
      def,
      state,
      observation,
      playerId as PlayerId,
      this.config,
      searchRng,
      legalMoves,
      runtime,
      pool,
    );

    // Check if fallback is needed: if search produced no meaningful visits
    // and a fallback policy is configured, degrade gracefully.
    const fallbackPolicy = this.config.fallbackPolicy;
    if (fallbackPolicy && fallbackPolicy !== 'none' && root.visits <= 1) {
      const fallbackResult = dispatchFallback(
        fallbackPolicy,
        def,
        state,
        playerId as PlayerId,
        legalMoves,
        nextAgentRng,
        runtime,
        this.config.heuristicTemperature,
      );
      if (fallbackResult !== null) {
        return fallbackResult;
      }
    }

    // Select best child by visit count.
    const bestChild = selectRootDecision(root, playerId as PlayerId);

    // Post-complete: ensure the selected move is fully resolved against
    // the real state (not a belief sample).  This prevents returning moves
    // with incomplete decision parameters.
    return postCompleteSelectedMove(
      def,
      state,
      root,
      bestChild,
      legalMoves,
      nextAgentRng,
      runtime,
    );
  }
}
