/**
 * MAST (Move-Average Sampling Technique) rollout policy.
 *
 * Collects per-move reward averages during MCTS search and uses them
 * to bias rollout move selection via cheap map lookups instead of
 * expensive `applyMove()` + `evaluateState()` calls per candidate.
 *
 * This module has NO dependencies on kernel modules — MAST selection
 * is a pure function of `MastStats` + RNG.
 */

import type { Rng } from '../../kernel/types.js';
import { nextInt } from '../../kernel/prng.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MastEntry {
  readonly visits: number;
  readonly rewardSums: readonly number[]; // indexed by player ordinal
}

export interface MastStats {
  readonly entries: Map<string, MastEntry>;
  totalUpdates: number;
}

// ---------------------------------------------------------------------------
// Candidate subset — only the fields MAST needs (no kernel dependency).
// ---------------------------------------------------------------------------

interface MastCandidate {
  readonly moveKey: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create empty MAST statistics for a search run.
 */
export function createMastStats(): MastStats {
  return { entries: new Map(), totalUpdates: 0 };
}

/**
 * Update MAST entries for each traversed move key with the reward vector.
 *
 * Mutates `stats` in-place for search performance (same rationale as
 * node statistics).
 */
export function updateMastStats(
  stats: MastStats,
  moveKeys: readonly string[],
  rewards: readonly number[],
): void {
  for (const key of moveKeys) {
    const existing = stats.entries.get(key);
    if (existing === undefined) {
      // First time seeing this move key — initialize entry.
      stats.entries.set(key, {
        visits: 1,
        rewardSums: rewards.map((r) => r),
      });
    } else {
      // Accumulate rewards into existing entry.
      const newSums = existing.rewardSums.map((s, i) => s + rewards[i]!);
      stats.entries.set(key, {
        visits: existing.visits + 1,
        rewardSums: newSums,
      });
    }
  }
  stats.totalUpdates += 1;
}

/**
 * Select a candidate using the MAST policy.
 *
 * - If `totalUpdates < warmUpThreshold`, falls back to uniform random.
 * - Otherwise, with probability `1 - epsilon`, picks the candidate with
 *   the highest mean reward for `currentPlayerOrdinal`; with probability
 *   `epsilon`, picks uniformly at random.
 * - Unseen move keys (not in stats) fall back to random selection.
 *
 * This function does NO kernel calls — selection is purely map lookups.
 */
export function mastSelectMove<T extends MastCandidate>(
  stats: MastStats,
  candidates: readonly T[],
  currentPlayerOrdinal: number,
  epsilon: number,
  warmUpThreshold: number,
  rng: Rng,
): { readonly candidate: T; readonly rng: Rng } {
  if (candidates.length === 1) {
    return { candidate: candidates[0]!, rng };
  }

  // Below warm-up threshold — random fallback.
  if (stats.totalUpdates < warmUpThreshold) {
    const [idx, rngAfter] = nextInt(rng, 0, candidates.length - 1);
    return { candidate: candidates[idx]!, rng: rngAfter };
  }

  // Epsilon check.
  const [epsilonRoll, rngAfterEpsilon] = nextInt(rng, 0, 999);
  const useRandom = epsilonRoll < Math.round(epsilon * 1000);

  if (useRandom) {
    const [idx, rngAfterIdx] = nextInt(rngAfterEpsilon, 0, candidates.length - 1);
    return { candidate: candidates[idx]!, rng: rngAfterIdx };
  }

  // Greedy: pick candidate with highest mean reward for current player.
  let bestIdx = 0;
  let bestMean = -Infinity;
  let anyKnown = false;

  for (let i = 0; i < candidates.length; i += 1) {
    const entry = stats.entries.get(candidates[i]!.moveKey);
    if (entry === undefined) {
      continue;
    }
    anyKnown = true;
    const mean = entry.rewardSums[currentPlayerOrdinal]! / entry.visits;
    if (mean > bestMean) {
      bestMean = mean;
      bestIdx = i;
    }
  }

  // If no candidates have MAST data, fall back to random.
  if (!anyKnown) {
    const [idx, rngAfterIdx] = nextInt(rngAfterEpsilon, 0, candidates.length - 1);
    return { candidate: candidates[idx]!, rng: rngAfterIdx };
  }

  return { candidate: candidates[bestIdx]!, rng: rngAfterEpsilon };
}
