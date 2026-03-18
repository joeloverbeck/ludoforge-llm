/**
 * Deterministic root parallelization for MCTS search (spec section 3.13).
 *
 * Splits a fixed iteration budget across workers, forks RNGs
 * deterministically, and merges root-level results by stable moveKey order.
 *
 * Initial implementation runs workers sequentially in the same thread —
 * deterministic but not yet concurrent.
 */

import type { Rng } from '../../kernel/types.js';
import type { PlayerId } from '../../kernel/branded.js';
import type { MoveKey } from './move-key.js';
import type { MctsNode } from './node.js';
import { fork } from '../../kernel/prng.js';

// ---------------------------------------------------------------------------
// Budget splitting
// ---------------------------------------------------------------------------

/**
 * Divide `totalIterations` as evenly as possible across `workerCount` workers.
 * Returns an array of length `workerCount` whose sum equals `totalIterations`.
 *
 * Remainder iterations are distributed one-per-worker from the front so that
 * the split is deterministic and stable.
 */
export function splitSearchBudget(
  totalIterations: number,
  workerCount: number,
): readonly number[] {
  if (!Number.isSafeInteger(totalIterations) || totalIterations < 1) {
    throw new RangeError(
      `totalIterations must be a positive safe integer, got ${totalIterations}`,
    );
  }
  if (!Number.isSafeInteger(workerCount) || workerCount < 1) {
    throw new RangeError(
      `workerCount must be a positive safe integer, got ${workerCount}`,
    );
  }

  const base = Math.floor(totalIterations / workerCount);
  const remainder = totalIterations % workerCount;
  const budgets: number[] = [];
  for (let i = 0; i < workerCount; i += 1) {
    budgets.push(base + (i < remainder ? 1 : 0));
  }
  return budgets;
}

// ---------------------------------------------------------------------------
// RNG forking
// ---------------------------------------------------------------------------

/**
 * Deterministically fork `baseRng` into `workerCount` independent RNGs.
 *
 * Uses a chain of `fork()` calls: each fork produces two children — the left
 * child becomes the worker RNG, the right child becomes the seed for the next
 * fork.  This guarantees deterministic, distinct streams for every worker
 * count.
 *
 * The consumed base RNG is NOT returned — callers must have already forked
 * a separate RNG for post-search use.
 */
export function forkWorkerRngs(
  baseRng: Rng,
  workerCount: number,
): readonly Rng[] {
  if (!Number.isSafeInteger(workerCount) || workerCount < 1) {
    throw new RangeError(
      `workerCount must be a positive safe integer, got ${workerCount}`,
    );
  }

  const rngs: Rng[] = [];
  let cursor = baseRng;
  for (let i = 0; i < workerCount; i += 1) {
    const [workerRng, nextCursor] = fork(cursor);
    rngs.push(workerRng);
    cursor = nextCursor;
  }
  return rngs;
}

// ---------------------------------------------------------------------------
// Root result merging
// ---------------------------------------------------------------------------

/** Per-move aggregate from a single worker's search root. */
export interface WorkerRootChildInfo {
  readonly moveKey: MoveKey;
  readonly visits: number;
  readonly availability: number;
  readonly totalReward: readonly number[];
}

/** Aggregated root result after merging all workers. */
export interface MergedRootResult {
  readonly totalVisits: number;
  readonly children: readonly MergedRootChild[];
}

export interface MergedRootChild {
  readonly moveKey: MoveKey;
  readonly visits: number;
  readonly availability: number;
  readonly totalReward: readonly number[];
}

/**
 * Extract per-child root info from an MCTS search root node.
 */
export function extractRootChildInfos(
  root: MctsNode,
): readonly WorkerRootChildInfo[] {
  const infos: WorkerRootChildInfo[] = [];
  for (const child of root.children) {
    if (child.moveKey !== null) {
      infos.push({
        moveKey: child.moveKey,
        visits: child.visits,
        availability: child.availability,
        totalReward: [...child.totalReward],
      });
    }
  }
  return infos;
}

/**
 * Merge root-level results from multiple workers into a single aggregate.
 *
 * Merges visits, availability, and reward totals by `moveKey`.  The output
 * is sorted by `moveKey` for stable, deterministic ordering.
 *
 * This is NOT a reusable full tree — only root-level aggregates.
 */
export function mergeRootResults(
  workerResults: readonly (readonly WorkerRootChildInfo[])[],
  playerCount: number,
): MergedRootResult {
  const byKey = new Map<string, {
    visits: number;
    availability: number;
    totalReward: number[];
  }>();

  let totalVisits = 0;

  for (const workerChildren of workerResults) {
    for (const child of workerChildren) {
      totalVisits += child.visits;
      const existing = byKey.get(child.moveKey);
      if (existing !== undefined) {
        existing.visits += child.visits;
        existing.availability += child.availability;
        for (let p = 0; p < playerCount; p += 1) {
          existing.totalReward[p] = (existing.totalReward[p] ?? 0) + (child.totalReward[p] ?? 0);
        }
      } else {
        const reward: number[] = new Array(playerCount).fill(0) as number[];
        for (let p = 0; p < playerCount; p += 1) {
          reward[p] = child.totalReward[p] ?? 0;
        }
        byKey.set(child.moveKey, {
          visits: child.visits,
          availability: child.availability,
          totalReward: reward,
        });
      }
    }
  }

  // Sort by moveKey for stable deterministic ordering.
  const sortedKeys = [...byKey.keys()].sort();
  const children: MergedRootChild[] = sortedKeys.map((key) => {
    const entry = byKey.get(key)!;
    return {
      moveKey: key,
      visits: entry.visits,
      availability: entry.availability,
      totalReward: entry.totalReward,
    };
  });

  return { totalVisits, children };
}

// ---------------------------------------------------------------------------
// Best-move selection from merged results
// ---------------------------------------------------------------------------

/**
 * Select the best moveKey from merged root results using the same policy as
 * `selectRootDecision`: highest visits, tie-broken by mean reward for the
 * exploring player.
 */
export function selectBestMergedChild(
  merged: MergedRootResult,
  exploringPlayer: PlayerId,
): MergedRootChild {
  if (merged.children.length === 0) {
    throw new Error('selectBestMergedChild: no children in merged result');
  }

  let best: MergedRootChild = merged.children[0]!;
  let bestVisits = best.visits;
  let bestMean = best.visits > 0
    ? (best.totalReward[exploringPlayer] ?? 0) / best.visits
    : 0;

  for (let i = 1; i < merged.children.length; i += 1) {
    const child = merged.children[i]!;
    const childMean = child.visits > 0
      ? (child.totalReward[exploringPlayer] ?? 0) / child.visits
      : 0;

    if (
      child.visits > bestVisits ||
      (child.visits === bestVisits && childMean > bestMean)
    ) {
      best = child;
      bestVisits = child.visits;
      bestMean = childMean;
    }
  }

  return best;
}
