import type { ExecutionOptions } from '../kernel/types-core.js';
import type { PerfProfiler } from '../kernel/perf-profiler.js';
import type { SnapshotDepth } from './snapshot-types.js';

/**
 * Simulation-layer options for `runGame` / `runGames`.
 *
 * Simulator-only concerns live at the top level; kernel execution
 * flags are nested under `kernel` so they flow through to
 * `initialState`, `applyTrustedMove`, etc. without mixing ownership.
 */
export interface SimulationOptions {
  /** Kernel execution flags forwarded to `initialState` / `applyTrustedMove`. */
  readonly kernel?: ExecutionOptions;
  /** When true the simulator skips delta computation between moves. */
  readonly skipDeltas?: boolean;
  /**
   * Trace retention policy for simulation runs.
   * `full` preserves decision logs and compound-turn summaries; `finalStateOnly`
   * keeps only the terminal state/result metadata.
   */
  readonly traceRetention?: 'full' | 'finalStateOnly';
  /** Snapshot depth captured by sim traces before each agent decision. */
  readonly snapshotDepth?: SnapshotDepth;
  /** Opt-in performance profiler. Accumulates sub-function timing when provided. */
  readonly profiler?: PerfProfiler;
}
