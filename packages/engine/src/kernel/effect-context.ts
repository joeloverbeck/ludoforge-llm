import type { PlayerId } from './branded.js';
import type { DecisionAuthorityContext } from './types-core.js';
import type { FreeOperationZoneFilterDiagnostics } from './eval-context.js';
import type { InterpreterMode } from './interpreter-mode.js';
import type { RuntimeTableIndex } from './runtime-table-index.js';
import type { AdjacencyGraph } from './spatial.js';
import type {
  ChoicePendingRequest,
  ConditionAST,
  EffectTraceEventContext,
  ExecutionCollector,
  GameDef,
  GameState,
  MoveParamValue,
  Rng,
  TriggerEvent,
} from './types.js';

export const DEFAULT_MAX_EFFECT_OPS = 10_000;

export interface PhaseTransitionBudget {
  remaining: number;
}

export interface EffectTraceContext {
  readonly eventContext: EffectTraceEventContext;
  readonly actionId?: string;
  readonly effectPathRoot: string;
}

export interface EffectContext {
  readonly def: GameDef;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly state: GameState;
  readonly rng: Rng;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly decisionAuthority: DecisionAuthorityContext;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly runtimeTableIndex?: RuntimeTableIndex;
  readonly moveParams: Readonly<Record<string, MoveParamValue>>;
  readonly traceContext?: EffectTraceContext;
  readonly effectPath?: string;
  readonly maxEffectOps?: number;
  readonly freeOperation?: boolean;
  readonly freeOperationZoneFilter?: ConditionAST;
  readonly freeOperationZoneFilterDiagnostics?: FreeOperationZoneFilterDiagnostics;
  readonly maxQueryResults?: number;
  readonly mode: InterpreterMode;
  readonly collector: ExecutionCollector;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  /** Accumulated forEach iteration path for scoping inner decision IDs. */
  readonly iterationPath?: string;
}

export interface EffectResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents?: readonly TriggerEvent[];
  readonly bindings?: Readonly<Record<string, unknown>>;
  readonly pendingChoice?: ChoicePendingRequest;
}

interface RuntimeEffectContextOptions extends Omit<EffectContext, 'decisionAuthority' | 'mode'> {
  readonly decisionAuthorityPlayer?: PlayerId;
  readonly ownershipEnforcement?: DecisionAuthorityContext['ownershipEnforcement'];
}

export const createExecutionEffectContext = (options: RuntimeEffectContextOptions): EffectContext => {
  const {
    activePlayer,
    decisionAuthorityPlayer = activePlayer,
    ownershipEnforcement = 'strict',
    ...ctx
  } = options;
  return {
    ...ctx,
    activePlayer,
    decisionAuthority: {
      source: 'engineRuntime',
      player: decisionAuthorityPlayer,
      ownershipEnforcement,
    },
    mode: 'execution',
  };
};

export const createDiscoveryEffectContext = (options: RuntimeEffectContextOptions): EffectContext => {
  const {
    activePlayer,
    decisionAuthorityPlayer = activePlayer,
    ownershipEnforcement = 'strict',
    ...ctx
  } = options;
  return {
    ...ctx,
    activePlayer,
    decisionAuthority: {
      source: 'engineRuntime',
      player: decisionAuthorityPlayer,
      ownershipEnforcement,
    },
    mode: 'discovery',
  };
};

export function getMaxEffectOps(ctx: Pick<EffectContext, 'maxEffectOps'>): number {
  return ctx.maxEffectOps ?? DEFAULT_MAX_EFFECT_OPS;
}
