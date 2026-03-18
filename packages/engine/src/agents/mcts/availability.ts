/**
 * Sound availability checking for MCTS selection (64MCTSPEROPT-003).
 *
 * Selection must distinguish three cases for each existing child:
 * 1. Known available — cached classification marks the child's moveKey
 *    as compatible (ready for state children, pending for decision roots).
 * 2. Unknown — the child's moveKey appears in the classification entry
 *    but has not been classified yet.
 * 3. Known unavailable — classification marks the child incompatible
 *    (illegal, pendingStochastic), or the move is absent from the entry.
 *
 * Rules:
 * - Only "known available" children may be scored by UCT/ISUCT.
 * - "Unknown" children must be classified on demand before selection.
 * - Raw move-key presence alone never upgrades a child from unknown to available.
 * - pendingStochastic must not be silently treated as ordinary pending.
 */

import type { MctsNode } from './node.js';
import type { MoveKey } from './move-key.js';
import type { CachedClassificationEntry, CachedLegalMoveInfo } from './state-cache.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AvailabilityResult {
  /** Children that are known available (ready or pending). */
  readonly available: MctsNode[];
  /** Children whose classification status is unknown, with their info index. */
  readonly unknown: ReadonlyArray<{ readonly child: MctsNode; readonly infoIndex: number }>;
}

// ---------------------------------------------------------------------------
// Core availability filter
// ---------------------------------------------------------------------------

/**
 * Partition children into known-available vs unknown based on their
 * classification status in the CachedClassificationEntry.
 *
 * Children whose moveKey is absent from the entry, or whose status is
 * `illegal` or `pendingStochastic`, are silently dropped (known unavailable).
 *
 * Side-effect: increments `child.availability` for available children.
 */
export function filterAvailableByClassification(
  children: readonly MctsNode[],
  entry: CachedClassificationEntry,
): AvailabilityResult {
  // Build a lookup from moveKey → index for O(1) access.
  const keyToIndex = new Map<MoveKey, number>();
  for (let i = 0; i < entry.infos.length; i += 1) {
    keyToIndex.set(entry.infos[i]!.moveKey, i);
  }

  const available: MctsNode[] = [];
  const unknown: { child: MctsNode; infoIndex: number }[] = [];

  for (const child of children) {
    if (child.moveKey === null) continue;

    const idx = keyToIndex.get(child.moveKey);
    if (idx === undefined) {
      // moveKey absent from classification entry → known unavailable.
      continue;
    }

    const info = entry.infos[idx]!;
    switch (info.status) {
      case 'ready':
      case 'pending':
        // Known available.
        child.availability += 1;
        available.push(child);
        break;
      case 'unknown':
        // Needs on-demand classification before selection.
        unknown.push({ child, infoIndex: idx });
        break;
      case 'illegal':
      case 'pendingStochastic':
        // Known unavailable — skip.
        break;
    }
  }

  return { available, unknown };
}

/**
 * Resolve unknown children by classifying them on demand.
 *
 * For each unknown child, calls `classifyFn(infoIndex)` which should
 * invoke `classifySpecificMove()` and return the updated info.
 * If the resolved status is available (ready/pending), the child is
 * added to the available list with its availability incremented.
 *
 * @returns Additional children that became available after classification.
 */
export function resolveUnknownChildren(
  unknowns: ReadonlyArray<{ readonly child: MctsNode; readonly infoIndex: number }>,
  classifyFn: (index: number) => CachedLegalMoveInfo | null,
): MctsNode[] {
  const newlyAvailable: MctsNode[] = [];

  for (const { child, infoIndex } of unknowns) {
    const info = classifyFn(infoIndex);
    if (info === null) continue;

    if (info.status === 'ready' || info.status === 'pending') {
      child.availability += 1;
      newlyAvailable.push(child);
    }
    // illegal / pendingStochastic → still unavailable, skip.
  }

  return newlyAvailable;
}
