import type { PlayerId } from './branded.js';
import { createCollector } from './execution-collector.js';
import type { FreeOperationExecutionOverlay } from './free-operation-overlay.js';
import type { ResolveRefCache } from './resolve-ref.js';
import type { RuntimeTableIndex } from './runtime-table-index.js';
import type { AdjacencyGraph } from './spatial.js';
import type { ExecutionCollector, GameDef, GameState } from './types.js';

export const DEFAULT_MAX_QUERY_RESULTS = 10_000;

export interface EvalRuntimeResources {
  readonly collector: ExecutionCollector;
  /**
   * Optional drive-scoped memoisation cache for `resolveRef`. Allocated by
   * `policy-preview.ts:driveSyntheticCompletion` and threaded through
   * `ApplyMoveCoreOptions.resolveRefCache`. `undefined` on every non-drive
   * production path; `eval-value.ts` falls back to the direct `resolveRef`
   * implementation when this is unset.
   */
  readonly resolveRefCache?: ResolveRefCache;
}

interface EvalRuntimeResourceInput {
  readonly collector?: ExecutionCollector;
  readonly resolveRefCache?: ResolveRefCache;
}

export function createEvalRuntimeResources(input?: EvalRuntimeResourceInput): EvalRuntimeResources {
  const {
    collector = createCollector(),
    resolveRefCache,
  } = input ?? {};
  return {
    collector,
    ...(resolveRefCache === undefined ? {} : { resolveRefCache }),
  };
}

export interface ReadContext {
  readonly def: GameDef;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly state: GameState;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly resources: EvalRuntimeResources;
  readonly runtimeTableIndex: RuntimeTableIndex | undefined;
  readonly freeOperationOverlay: FreeOperationExecutionOverlay | undefined;
  readonly maxQueryResults: number | undefined;
  readonly collector: ExecutionCollector;
}


export type EvalContextInput = Omit<ReadContext, 'collector' | 'runtimeTableIndex' | 'freeOperationOverlay' | 'maxQueryResults'> & {
  readonly resources: EvalRuntimeResources;
  readonly runtimeTableIndex?: RuntimeTableIndex | undefined;
  readonly freeOperationOverlay?: FreeOperationExecutionOverlay | undefined;
  readonly maxQueryResults?: number | undefined;
};

export function createEvalContext(input: EvalContextInput): ReadContext {
  return {
    ...input,
    runtimeTableIndex: input.runtimeTableIndex,
    freeOperationOverlay: input.freeOperationOverlay,
    maxQueryResults: input.maxQueryResults,
    collector: input.resources.collector,
  };
}

export function getMaxQueryResults(ctx: { readonly maxQueryResults?: number | undefined }): number {
  return ctx.maxQueryResults ?? DEFAULT_MAX_QUERY_RESULTS;
}
