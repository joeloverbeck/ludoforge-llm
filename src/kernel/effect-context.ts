import type { PlayerId } from './branded.js';
import type { FreeOperationZoneFilterDiagnostics } from './eval-context.js';
import type { RuntimeTableIndex } from './runtime-table-index.js';
import type { AdjacencyGraph } from './spatial.js';
import type {
  ChoicePendingRequest,
  ConditionAST,
  ExecutionCollector,
  GameDef,
  GameState,
  MapSpaceDef,
  MoveParamValue,
  Rng,
  TriggerEvent,
} from './types.js';

export const DEFAULT_MAX_EFFECT_OPS = 10_000;
export type EffectInterpreterMode = 'execution' | 'discovery';

export interface PhaseTransitionBudget {
  remaining: number;
}

export interface EffectContext {
  readonly def: GameDef;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly state: GameState;
  readonly rng: Rng;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly runtimeTableIndex?: RuntimeTableIndex;
  readonly moveParams: Readonly<Record<string, MoveParamValue>>;
  readonly maxEffectOps?: number;
  readonly mapSpaces?: readonly MapSpaceDef[];
  readonly freeOperation?: boolean;
  readonly freeOperationZoneFilter?: ConditionAST;
  readonly freeOperationZoneFilterDiagnostics?: FreeOperationZoneFilterDiagnostics;
  readonly maxQueryResults?: number;
  readonly mode?: EffectInterpreterMode;
  readonly collector: ExecutionCollector;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
}

export interface EffectResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents?: readonly TriggerEvent[];
  readonly bindings?: Readonly<Record<string, unknown>>;
  readonly pendingChoice?: ChoicePendingRequest;
}

export function getMaxEffectOps(ctx: Pick<EffectContext, 'maxEffectOps'>): number {
  return ctx.maxEffectOps ?? DEFAULT_MAX_EFFECT_OPS;
}
