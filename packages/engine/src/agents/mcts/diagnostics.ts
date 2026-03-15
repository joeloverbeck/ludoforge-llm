/**
 * Optional MCTS search diagnostics for tuning and testing visibility.
 *
 * Two collection modes:
 * - Post-hoc: `collectDiagnostics()` walks the tree after search (nodes, depth, visits).
 * - Hot-loop: `MutableDiagnosticsAccumulator` collects timings and counters during search.
 *
 * Enabled by `config.diagnostics: true`.
 */

import type { MctsNode } from './node.js';

// ---------------------------------------------------------------------------
// Mutable accumulator (hot-loop instrumentation)
// ---------------------------------------------------------------------------

/**
 * Mutable accumulator threaded through the MCTS hot loop.
 * Created once per `runSearch()` call; merged into the final
 * `MctsSearchDiagnostics` by `collectDiagnostics()`.
 *
 * Mutability is intentional — immutable snapshots per iteration
 * would be prohibitively expensive at thousands of iterations.
 */
export interface MutableDiagnosticsAccumulator {
  // Per-phase timings (ms, from performance.now())
  selectionTimeMs: number;
  expansionTimeMs: number;
  simulationTimeMs: number;
  evaluationTimeMs: number;
  backpropTimeMs: number;
  beliefSamplingTimeMs: number;

  // Kernel-call counters
  legalMovesCalls: number;
  materializeCalls: number;
  applyMoveCalls: number;
  terminalCalls: number;
  evaluateStateCalls: number;

  // Cache counters (zeroed here, wired in 63MCTSPERROLLFRESEA-004)
  stateCacheLookups: number;
  stateCacheHits: number;
  terminalCacheHits: number;
  legalMovesCacheHits: number;
  rewardCacheHits: number;

  // Compressed-ply counters
  forcedMovePlies: number;
  hybridRolloutPlies: number;

  // Defensive failure counters
  expansionApplyMoveFailures: number;

  // Decision node counters
  decisionNodesCreated: number;
  decisionDepthMax: number;
  decisionCompletionsInTree: number;
  decisionCompletionsInRollout: number;
  decisionIllegalPruned: number;

  // Aggregation arrays (for computing averages)
  leafRewardSpans: number[];
  selectionDepths: number[];
}

/**
 * Create a zeroed accumulator. Called once at the start of `runSearch()`.
 */
export function createAccumulator(): MutableDiagnosticsAccumulator {
  return {
    selectionTimeMs: 0,
    expansionTimeMs: 0,
    simulationTimeMs: 0,
    evaluationTimeMs: 0,
    backpropTimeMs: 0,
    beliefSamplingTimeMs: 0,

    legalMovesCalls: 0,
    materializeCalls: 0,
    applyMoveCalls: 0,
    terminalCalls: 0,
    evaluateStateCalls: 0,

    stateCacheLookups: 0,
    stateCacheHits: 0,
    terminalCacheHits: 0,
    legalMovesCacheHits: 0,
    rewardCacheHits: 0,

    forcedMovePlies: 0,
    hybridRolloutPlies: 0,

    expansionApplyMoveFailures: 0,

    decisionNodesCreated: 0,
    decisionDepthMax: 0,
    decisionCompletionsInTree: 0,
    decisionCompletionsInRollout: 0,
    decisionIllegalPruned: 0,

    leafRewardSpans: [],
    selectionDepths: [],
  };
}

// ---------------------------------------------------------------------------
// Immutable diagnostics result
// ---------------------------------------------------------------------------

export interface MctsSearchDiagnostics {
  readonly iterations: number;
  readonly nodesAllocated: number;
  readonly maxTreeDepth: number;
  readonly rootChildVisits: Readonly<Record<string, number>>;
  readonly totalTimeMs?: number;

  // Per-phase timings (ms, from performance.now())
  readonly selectionTimeMs?: number;
  readonly expansionTimeMs?: number;
  readonly simulationTimeMs?: number;
  readonly evaluationTimeMs?: number;
  readonly backpropTimeMs?: number;
  readonly beliefSamplingTimeMs?: number;

  // Kernel-call counters
  readonly legalMovesCalls?: number;
  readonly materializeCalls?: number;
  readonly applyMoveCalls?: number;
  readonly terminalCalls?: number;
  readonly evaluateStateCalls?: number;

  // Cache counters
  readonly stateCacheLookups?: number;
  readonly stateCacheHits?: number;
  readonly terminalCacheHits?: number;
  readonly legalMovesCacheHits?: number;
  readonly rewardCacheHits?: number;

  // Compressed-ply counters
  readonly forcedMovePlies?: number;
  readonly hybridRolloutPlies?: number;

  // Defensive failure counters
  readonly expansionApplyMoveFailures?: number;

  // Decision node counters
  readonly decisionNodesCreated?: number;
  readonly decisionDepthMax?: number;
  readonly decisionCompletionsInTree?: number;
  readonly decisionCompletionsInRollout?: number;
  readonly decisionIllegalPruned?: number;

  // Derived averages
  readonly avgSelectionDepth?: number;
  readonly avgLeafRewardSpan?: number;

  // Mode / stop metadata
  readonly rolloutMode?: 'legacy' | 'hybrid' | 'direct';
  readonly rootStopReason?: 'none' | 'solver' | 'time' | 'confidence' | 'iterations';
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

/**
 * Walk the tree from `root` and collect diagnostic statistics.
 * When an accumulator is provided, merges hot-loop counters into the result.
 *
 * @param root        - the search tree root
 * @param iterations  - number of iterations completed
 * @param startTime   - optional `performance.now()` value captured before search
 * @param accumulator - optional hot-loop accumulator from the search
 */
export function collectDiagnostics(
  root: MctsNode,
  iterations: number,
  startTime?: number,
  accumulator?: MutableDiagnosticsAccumulator,
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

  const base: MctsSearchDiagnostics = {
    iterations,
    nodesAllocated,
    maxTreeDepth,
    rootChildVisits,
    ...(startTime !== undefined
      ? { totalTimeMs: performance.now() - startTime }
      : {}),
  };

  if (accumulator === undefined) {
    return base;
  }

  // Merge hot-loop counters into the result.
  const avgSelectionDepth =
    accumulator.selectionDepths.length > 0
      ? accumulator.selectionDepths.reduce((a, b) => a + b, 0) /
        accumulator.selectionDepths.length
      : undefined;

  const avgLeafRewardSpan =
    accumulator.leafRewardSpans.length > 0
      ? accumulator.leafRewardSpans.reduce((a, b) => a + b, 0) /
        accumulator.leafRewardSpans.length
      : undefined;

  return {
    ...base,

    selectionTimeMs: accumulator.selectionTimeMs,
    expansionTimeMs: accumulator.expansionTimeMs,
    simulationTimeMs: accumulator.simulationTimeMs,
    evaluationTimeMs: accumulator.evaluationTimeMs,
    backpropTimeMs: accumulator.backpropTimeMs,
    beliefSamplingTimeMs: accumulator.beliefSamplingTimeMs,

    legalMovesCalls: accumulator.legalMovesCalls,
    materializeCalls: accumulator.materializeCalls,
    applyMoveCalls: accumulator.applyMoveCalls,
    terminalCalls: accumulator.terminalCalls,
    evaluateStateCalls: accumulator.evaluateStateCalls,

    stateCacheLookups: accumulator.stateCacheLookups,
    stateCacheHits: accumulator.stateCacheHits,
    terminalCacheHits: accumulator.terminalCacheHits,
    legalMovesCacheHits: accumulator.legalMovesCacheHits,
    rewardCacheHits: accumulator.rewardCacheHits,

    forcedMovePlies: accumulator.forcedMovePlies,
    hybridRolloutPlies: accumulator.hybridRolloutPlies,

    expansionApplyMoveFailures: accumulator.expansionApplyMoveFailures,

    decisionNodesCreated: accumulator.decisionNodesCreated,
    decisionDepthMax: accumulator.decisionDepthMax,
    decisionCompletionsInTree: accumulator.decisionCompletionsInTree,
    decisionCompletionsInRollout: accumulator.decisionCompletionsInRollout,
    decisionIllegalPruned: accumulator.decisionIllegalPruned,

    ...(avgSelectionDepth !== undefined ? { avgSelectionDepth } : {}),
    ...(avgLeafRewardSpan !== undefined ? { avgLeafRewardSpan } : {}),
  };
}
