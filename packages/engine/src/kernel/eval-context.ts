import type { PlayerId } from './branded.js';
import { createCollector } from './execution-collector.js';
import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';
import { createQueryRuntimeCache, type QueryRuntimeCache } from './query-runtime-cache.js';
import type { RuntimeTableIndex } from './runtime-table-index.js';
import type { AdjacencyGraph } from './spatial.js';
import type { ConditionAST, ExecutionCollector, GameDef, GameState } from './types.js';

export const DEFAULT_MAX_QUERY_RESULTS = 10_000;

export interface FreeOperationZoneFilterDiagnostics {
  readonly source: FreeOperationZoneFilterSurface;
  readonly actionId: string;
  readonly moveParams: Readonly<Record<string, unknown>>;
}

export interface EvalRuntimeResources {
  readonly collector: ExecutionCollector;
  readonly queryRuntimeCache: QueryRuntimeCache;
}

interface EvalRuntimeResourceInput {
  readonly collector?: ExecutionCollector;
  readonly queryRuntimeCache?: QueryRuntimeCache;
}

export function createEvalRuntimeResources(input?: EvalRuntimeResourceInput): EvalRuntimeResources {
  const {
    collector = createCollector(),
    queryRuntimeCache = createQueryRuntimeCache(),
  } = input ?? {};
  return {
    collector,
    queryRuntimeCache,
  };
}

export interface EvalContext {
  readonly def: GameDef;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly state: GameState;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly queryRuntimeCache: QueryRuntimeCache;
  readonly runtimeTableIndex?: RuntimeTableIndex;
  readonly freeOperationZoneFilter?: ConditionAST;
  readonly freeOperationZoneFilterDiagnostics?: FreeOperationZoneFilterDiagnostics;
  readonly maxQueryResults?: number;
  readonly collector: ExecutionCollector;
}

export type EvalContextInput = Omit<EvalContext, 'collector' | 'queryRuntimeCache'> & {
  readonly resources?: EvalRuntimeResources;
};

export function createEvalContext(input: EvalContextInput): EvalContext {
  const {
    resources = createEvalRuntimeResources(),
    ...ctx
  } = input;
  return {
    ...ctx,
    queryRuntimeCache: resources.queryRuntimeCache,
    collector: resources.collector,
  };
}

export function getMaxQueryResults(ctx: Pick<EvalContext, 'maxQueryResults'>): number {
  return ctx.maxQueryResults ?? DEFAULT_MAX_QUERY_RESULTS;
}
