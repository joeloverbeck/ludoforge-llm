import type { PlayerId } from './branded.js';
import type { AdjacencyGraph } from './spatial.js';
import type { ConditionAST, ExecutionCollector, GameDef, GameState, MapSpaceDef } from './types.js';

export const DEFAULT_MAX_QUERY_RESULTS = 10_000;

export interface FreeOperationZoneFilterDiagnostics {
  readonly source: 'legalChoices';
  readonly actionId: string;
  readonly moveParams: Readonly<Record<string, unknown>>;
}

export interface EvalContext {
  readonly def: GameDef;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly state: GameState;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly mapSpaces?: readonly MapSpaceDef[];
  readonly freeOperationZoneFilter?: ConditionAST;
  readonly freeOperationZoneFilterDiagnostics?: FreeOperationZoneFilterDiagnostics;
  readonly maxQueryResults?: number;
  readonly collector: ExecutionCollector;
}

export function getMaxQueryResults(ctx: Pick<EvalContext, 'maxQueryResults'>): number {
  return ctx.maxQueryResults ?? DEFAULT_MAX_QUERY_RESULTS;
}
