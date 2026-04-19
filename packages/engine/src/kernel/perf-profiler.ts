/**
 * Opt-in performance profiler for kernel sub-function timing.
 *
 * When present on ExecutionOptions, kernel sub-functions accumulate
 * wall-clock timing into named buckets. When absent, all instrumentation
 * is a no-op (single `!== undefined` check per point).
 *
 * The profiler is a measurement side-channel only — it does NOT affect
 * determinism (Foundation 5), game state (Foundation 7), or engine
 * agnosticism (Foundation 1).
 */

export interface PerfBucket {
  count: number;
  totalMs: number;
}

export interface PerfProfilerData {
  // simulator game-loop top-level
  readonly simTerminalResult: PerfBucket;
  readonly simLegalMoves: PerfBucket;
  readonly simAgentChooseMove: PerfBucket;
  readonly simApplyMove: PerfBucket;
  readonly simComputeDeltas: PerfBucket;
  // applyMoveCore top-level phases
  readonly executeMoveAction: PerfBucket;
  readonly computeFullHash: PerfBucket;
  readonly advanceToDecisionPoint: PerfBucket;
  readonly applyTurnFlowEligibility: PerfBucket;
  readonly applyBoundaryExpiry: PerfBucket;
  readonly applyDeferredEventEffects: PerfBucket;
  readonly evaluateMoveLegality: PerfBucket;
  // executeMoveAction sub-phases
  readonly validateMove: PerfBucket;
  readonly resolvePreflight: PerfBucket;
  readonly actionEffects: PerfBucket;
  readonly dispatchTriggers: PerfBucket;
  // deeper instrumentation
  readonly applyEffects: PerfBucket;
  readonly evalCondition: PerfBucket;
  readonly evalValue: PerfBucket;
  readonly consumeFreeOperationGrant: PerfBucket;
  readonly moveDecisionSequence: PerfBucket;
}

export type PerfBucketKey = keyof PerfProfilerData;

export interface PerfProfiler {
  readonly data: PerfProfilerData;
  /**
   * Dynamic buckets for fine-grained per-effect-type or per-operation profiling.
   * Keys are arbitrary strings (e.g., "effect:setVar", "effect:forEach").
   * Use perfDynStart/perfDynEnd to accumulate into these.
   */
  readonly dynamic: Map<string, PerfBucket>;
}

const createBucket = (): PerfBucket => ({ count: 0, totalMs: 0 });

export function createPerfProfiler(): PerfProfiler {
  return {
    dynamic: new Map(),
    data: {
      simTerminalResult: createBucket(),
      simLegalMoves: createBucket(),
      simAgentChooseMove: createBucket(),
      simApplyMove: createBucket(),
      simComputeDeltas: createBucket(),
      executeMoveAction: createBucket(),
      computeFullHash: createBucket(),
      dispatchTriggers: createBucket(),
      advanceToDecisionPoint: createBucket(),
      applyTurnFlowEligibility: createBucket(),
      applyBoundaryExpiry: createBucket(),
      applyEffects: createBucket(),
      evalCondition: createBucket(),
      evalValue: createBucket(),
      applyDeferredEventEffects: createBucket(),
      evaluateMoveLegality: createBucket(),
      validateMove: createBucket(),
      resolvePreflight: createBucket(),
      actionEffects: createBucket(),
      consumeFreeOperationGrant: createBucket(),
      moveDecisionSequence: createBucket(),
    },
  };
}

/** Inline timing helper — use at instrumentation points. */
export function perfStart(profiler: PerfProfiler | undefined): number {
  return profiler !== undefined ? performance.now() : 0;
}

/** Inline timing helper — use at instrumentation points. */
export function perfEnd(profiler: PerfProfiler | undefined, key: PerfBucketKey, startTime: number): void {
  if (profiler !== undefined) {
    const bucket = profiler.data[key];
    bucket.totalMs += performance.now() - startTime;
    bucket.count += 1;
  }
}

/** Dynamic bucket timing — use for per-effect-type or per-operation profiling. */
export function perfDynEnd(profiler: PerfProfiler | undefined, key: string, startTime: number): void {
  if (profiler !== undefined) {
    let bucket = profiler.dynamic.get(key);
    if (bucket === undefined) {
      bucket = { count: 0, totalMs: 0 };
      profiler.dynamic.set(key, bucket);
    }
    bucket.totalMs += performance.now() - startTime;
    bucket.count += 1;
  }
}

/** Dynamic count-only bucket helper for deterministic workload counters. */
export function perfCount(profiler: PerfProfiler | undefined, key: string, increment = 1): void {
  if (profiler !== undefined) {
    let bucket = profiler.dynamic.get(key);
    if (bucket === undefined) {
      bucket = { count: 0, totalMs: 0 };
      profiler.dynamic.set(key, bucket);
    }
    bucket.count += increment;
  }
}
