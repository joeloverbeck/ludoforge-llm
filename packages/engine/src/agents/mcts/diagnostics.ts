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
  classificationCacheHits: number;

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
  decisionBoundaryFailures: number;

  // Gap 1: Per-kernel-call timing (ms)
  legalMovesTimeMs: number;
  applyMoveTimeMs: number;
  terminalTimeMs: number;
  materializeTimeMs: number;
  evaluateTimeMs: number;

  // Gap 2: State size metrics
  stateSizeSamples: number[];

  // Gap 3: Effect chain profiling
  totalTriggerFirings: number;
  maxTriggerFiringsPerMove: number;

  // Gap 4: Materialization breakdown
  templateCompletionAttempts: number;
  templateCompletionSuccesses: number;
  templateCompletionFailures: number;

  // Gap 5: Memory pressure
  heapUsedAtStartBytes: number;
  heapUsedAtEndBytes: number;

  // Gap 6: Branching factor per depth
  branchingFactorSamples: Array<{ depth: number; count: number }>;

  // Gap 7: Per-iteration timing
  iterationTimeSamples: number[];

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
    classificationCacheHits: 0,

    forcedMovePlies: 0,
    hybridRolloutPlies: 0,

    expansionApplyMoveFailures: 0,

    decisionNodesCreated: 0,
    decisionDepthMax: 0,
    decisionCompletionsInTree: 0,
    decisionCompletionsInRollout: 0,
    decisionIllegalPruned: 0,
    decisionBoundaryFailures: 0,

    legalMovesTimeMs: 0,
    applyMoveTimeMs: 0,
    terminalTimeMs: 0,
    materializeTimeMs: 0,
    evaluateTimeMs: 0,

    stateSizeSamples: [],

    totalTriggerFirings: 0,
    maxTriggerFiringsPerMove: 0,

    templateCompletionAttempts: 0,
    templateCompletionSuccesses: 0,
    templateCompletionFailures: 0,

    heapUsedAtStartBytes: 0,
    heapUsedAtEndBytes: 0,

    branchingFactorSamples: [],

    iterationTimeSamples: [],

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
  readonly classificationCacheHits?: number;

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
  readonly decisionBoundaryFailures?: number;

  // Gap 1: Per-kernel-call timing (ms)
  readonly legalMovesTimeMs?: number;
  readonly applyMoveTimeMs?: number;
  readonly terminalTimeMs?: number;
  readonly materializeTimeMs?: number;
  readonly evaluateTimeMs?: number;

  // Gap 2: State size metrics (derived)
  readonly avgStateSizeBytes?: number;
  readonly maxStateSizeBytes?: number;
  readonly stateSizeSampleCount?: number;

  // Gap 3: Effect chain profiling
  readonly totalTriggerFirings?: number;
  readonly maxTriggerFiringsPerMove?: number;
  readonly avgTriggerFiringsPerMove?: number;

  // Gap 4: Materialization breakdown
  readonly templateCompletionAttempts?: number;
  readonly templateCompletionSuccesses?: number;
  readonly templateCompletionFailures?: number;

  // Gap 5: Memory pressure
  readonly heapUsedAtStartBytes?: number;
  readonly heapUsedAtEndBytes?: number;
  readonly heapGrowthBytes?: number;

  // Gap 6: Branching factor (derived)
  readonly avgBranchingFactor?: number;
  readonly maxBranchingFactor?: number;
  readonly branchingFactorByDepth?: Readonly<Record<number, { readonly avg: number; readonly max: number; readonly count: number }>>;

  // Gap 7: Per-iteration timing (derived)
  readonly iterationTimeP50Ms?: number;
  readonly iterationTimeP95Ms?: number;
  readonly iterationTimeMaxMs?: number;
  readonly iterationTimeStddevMs?: number;

  // Derived averages
  readonly avgSelectionDepth?: number;
  readonly avgLeafRewardSpan?: number;

  // Mode / stop metadata
  readonly leafEvaluatorType?: 'heuristic' | 'rollout' | 'auto';
  readonly rootStopReason?: 'none' | 'solver' | 'time' | 'confidence' | 'iterations';
}

// ---------------------------------------------------------------------------
// Private helpers for derived metrics
// ---------------------------------------------------------------------------

/** Compute per-depth branching factor statistics. */
function computeBranchingByDepth(
  samples: readonly { readonly depth: number; readonly count: number }[],
): Record<number, { avg: number; max: number; count: number }> {
  const byDepth = new Map<number, { total: number; max: number; count: number }>();
  for (const s of samples) {
    const entry = byDepth.get(s.depth);
    if (entry !== undefined) {
      entry.total += s.count;
      entry.count += 1;
      if (s.count > entry.max) entry.max = s.count;
    } else {
      byDepth.set(s.depth, { total: s.count, max: s.count, count: 1 });
    }
  }
  const result: Record<number, { avg: number; max: number; count: number }> = {};
  for (const [depth, entry] of byDepth) {
    result[depth] = { avg: entry.total / entry.count, max: entry.max, count: entry.count };
  }
  return result;
}

/** Compute percentile, max, and stddev from sorted timing samples. */
function computeIterationStats(
  samples: readonly number[],
): { p50: number; p95: number; max: number; stddev: number } | undefined {
  if (samples.length === 0) return undefined;
  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  const max = sorted[sorted.length - 1]!;
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sorted.length;
  return { p50, p95, max, stddev: Math.sqrt(variance) };
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

  // Gap 2: State size derived metrics.
  const stateSizeSamples = accumulator.stateSizeSamples;
  const stateSizeMetrics = stateSizeSamples.length > 0
    ? {
        avgStateSizeBytes: stateSizeSamples.reduce((a, b) => a + b, 0) / stateSizeSamples.length,
        maxStateSizeBytes: Math.max(...stateSizeSamples),
        stateSizeSampleCount: stateSizeSamples.length,
      }
    : {};

  // Gap 3: Trigger firings derived average.
  const totalApplyMoves = accumulator.applyMoveCalls;
  const avgTriggerFiringsPerMove = totalApplyMoves > 0
    ? accumulator.totalTriggerFirings / totalApplyMoves
    : 0;

  // Gap 5: Heap growth.
  const heapGrowth = accumulator.heapUsedAtEndBytes > 0 && accumulator.heapUsedAtStartBytes > 0
    ? { heapGrowthBytes: accumulator.heapUsedAtEndBytes - accumulator.heapUsedAtStartBytes }
    : {};

  // Gap 6: Branching factor derived metrics.
  const bfSamples = accumulator.branchingFactorSamples;
  const branchingMetrics = bfSamples.length > 0
    ? {
        avgBranchingFactor: bfSamples.reduce((a, b) => a + b.count, 0) / bfSamples.length,
        maxBranchingFactor: Math.max(...bfSamples.map(s => s.count)),
        branchingFactorByDepth: computeBranchingByDepth(bfSamples),
      }
    : {};

  // Gap 7: Per-iteration timing derived metrics.
  const iterStats = computeIterationStats(accumulator.iterationTimeSamples);
  const iterationMetrics = iterStats !== undefined
    ? {
        iterationTimeP50Ms: iterStats.p50,
        iterationTimeP95Ms: iterStats.p95,
        iterationTimeMaxMs: iterStats.max,
        iterationTimeStddevMs: iterStats.stddev,
      }
    : {};

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
    classificationCacheHits: accumulator.classificationCacheHits,

    forcedMovePlies: accumulator.forcedMovePlies,
    hybridRolloutPlies: accumulator.hybridRolloutPlies,

    expansionApplyMoveFailures: accumulator.expansionApplyMoveFailures,

    decisionNodesCreated: accumulator.decisionNodesCreated,
    decisionDepthMax: accumulator.decisionDepthMax,
    decisionCompletionsInTree: accumulator.decisionCompletionsInTree,
    decisionCompletionsInRollout: accumulator.decisionCompletionsInRollout,
    decisionIllegalPruned: accumulator.decisionIllegalPruned,
    decisionBoundaryFailures: accumulator.decisionBoundaryFailures,

    // Gap 1: Per-kernel-call timing
    legalMovesTimeMs: accumulator.legalMovesTimeMs,
    applyMoveTimeMs: accumulator.applyMoveTimeMs,
    terminalTimeMs: accumulator.terminalTimeMs,
    materializeTimeMs: accumulator.materializeTimeMs,
    evaluateTimeMs: accumulator.evaluateTimeMs,

    // Gap 2: State size metrics
    ...stateSizeMetrics,

    // Gap 3: Effect chain profiling
    totalTriggerFirings: accumulator.totalTriggerFirings,
    maxTriggerFiringsPerMove: accumulator.maxTriggerFiringsPerMove,
    avgTriggerFiringsPerMove,

    // Gap 4: Materialization breakdown
    templateCompletionAttempts: accumulator.templateCompletionAttempts,
    templateCompletionSuccesses: accumulator.templateCompletionSuccesses,
    templateCompletionFailures: accumulator.templateCompletionFailures,

    // Gap 5: Memory pressure
    heapUsedAtStartBytes: accumulator.heapUsedAtStartBytes,
    heapUsedAtEndBytes: accumulator.heapUsedAtEndBytes,
    ...heapGrowth,

    // Gap 6: Branching factor
    ...branchingMetrics,

    // Gap 7: Per-iteration timing
    ...iterationMetrics,

    ...(avgSelectionDepth !== undefined ? { avgSelectionDepth } : {}),
    ...(avgLeafRewardSpan !== undefined ? { avgLeafRewardSpan } : {}),
  };
}
