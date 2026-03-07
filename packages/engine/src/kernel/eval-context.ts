import type { PlayerId } from './branded.js';
import { createCollector } from './execution-collector.js';
import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';
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
}

interface EvalRuntimeResourceInput {
  readonly collector?: ExecutionCollector;
}

export function createEvalRuntimeResources(input?: EvalRuntimeResourceInput): EvalRuntimeResources {
  const {
    collector = createCollector(),
  } = input ?? {};
  return {
    collector,
  };
}

export interface EvalContext {
  readonly def: GameDef;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly state: GameState;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly resources: EvalRuntimeResources;
  readonly runtimeTableIndex?: RuntimeTableIndex;
  readonly freeOperationZoneFilter?: ConditionAST;
  readonly freeOperationZoneFilterDiagnostics?: FreeOperationZoneFilterDiagnostics;
  readonly maxQueryResults?: number;
  readonly collector: ExecutionCollector;
}

export type EvalContextInput = Omit<EvalContext, 'collector'> & {
  readonly resources: EvalRuntimeResources;
};

export function createEvalContext(input: EvalContextInput): EvalContext {
  const {
    resources,
    ...ctx
  } = input;
  return {
    ...ctx,
    resources,
    collector: resources.collector,
  };
}

export function getMaxQueryResults(ctx: Pick<EvalContext, 'maxQueryResults'>): number {
  return ctx.maxQueryResults ?? DEFAULT_MAX_QUERY_RESULTS;
}
