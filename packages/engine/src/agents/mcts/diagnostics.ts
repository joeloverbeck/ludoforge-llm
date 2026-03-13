/**
 * Optional MCTS search diagnostics for tuning and testing visibility.
 *
 * Enabled by `config.diagnostics: true`.  Collects tree statistics after
 * search completes — never called during the hot search loop.
 */

import type { MctsNode } from './node.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MctsSearchDiagnostics {
  readonly iterations: number;
  readonly nodesAllocated: number;
  readonly maxTreeDepth: number;
  readonly rootChildVisits: Readonly<Record<string, number>>;
  readonly totalTimeMs?: number;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

/**
 * Walk the tree from `root` and collect diagnostic statistics.
 *
 * @param root       - the search tree root
 * @param iterations - number of iterations completed
 * @param startTime  - optional `Date.now()` value captured before search
 */
export function collectDiagnostics(
  root: MctsNode,
  iterations: number,
  startTime?: number,
): MctsSearchDiagnostics {
  // Count nodes and max depth via iterative BFS.
  let nodesAllocated = 0;
  let maxTreeDepth = 0;

  const stack: Array<{ readonly node: MctsNode; readonly depth: number }> = [
    { node: root, depth: 0 },
  ];

  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    nodesAllocated += 1;
    if (depth > maxTreeDepth) {
      maxTreeDepth = depth;
    }
    for (const child of node.children) {
      stack.push({ node: child, depth: depth + 1 });
    }
  }

  // Root child visit counts keyed by moveKey.
  const rootChildVisits: Record<string, number> = {};
  for (const child of root.children) {
    const key = child.moveKey ?? '(null)';
    rootChildVisits[key] = child.visits;
  }

  const base = {
    iterations,
    nodesAllocated,
    maxTreeDepth,
    rootChildVisits,
  };

  if (startTime !== undefined) {
    return { ...base, totalTimeMs: Date.now() - startTime };
  }

  return base;
}
