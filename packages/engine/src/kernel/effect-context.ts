import type { PlayerId } from './branded.js';
import type {
  DecisionAuthorityProbeContext,
  DecisionAuthorityStrictContext,
} from './types-core.js';
import type { FreeOperationZoneFilterDiagnostics } from './eval-context.js';
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

interface EffectContextBase {
  readonly def: GameDef;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly state: GameState;
  readonly rng: Rng;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
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
  readonly collector: ExecutionCollector;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  /** Accumulated forEach iteration path for scoping inner decision IDs. */
  readonly iterationPath?: string;
}

export interface ExecutionEffectContext extends EffectContextBase {
  readonly decisionAuthority: DecisionAuthorityStrictContext;
  readonly mode: 'execution';
}

export interface DiscoveryStrictEffectContext extends EffectContextBase {
  readonly decisionAuthority: DecisionAuthorityStrictContext;
  readonly mode: 'discovery';
}

export interface DiscoveryProbeEffectContext extends EffectContextBase {
  readonly decisionAuthority: DecisionAuthorityProbeContext;
  readonly mode: 'discovery';
}

export type DiscoveryEffectContext = DiscoveryStrictEffectContext | DiscoveryProbeEffectContext;

export type EffectContext = ExecutionEffectContext | DiscoveryEffectContext;

export interface EffectResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents?: readonly TriggerEvent[];
  readonly bindings?: Readonly<Record<string, unknown>>;
  readonly pendingChoice?: ChoicePendingRequest;
}

interface RuntimeEffectContextOptions extends EffectContextBase {
  readonly decisionAuthorityPlayer?: PlayerId;
}

export const createExecutionEffectContext = (options: RuntimeEffectContextOptions): ExecutionEffectContext => {
  const {
    activePlayer,
    decisionAuthorityPlayer = activePlayer,
    ...ctx
  } = options;
  return {
    ...ctx,
    activePlayer,
    decisionAuthority: {
      source: 'engineRuntime',
      player: decisionAuthorityPlayer,
      ownershipEnforcement: 'strict',
    },
    mode: 'execution',
  };
};

export const createDiscoveryStrictEffectContext = (options: RuntimeEffectContextOptions): DiscoveryStrictEffectContext => {
  const {
    activePlayer,
    decisionAuthorityPlayer = activePlayer,
    ...ctx
  } = options;
  return {
    ...ctx,
    activePlayer,
    decisionAuthority: {
      source: 'engineRuntime',
      player: decisionAuthorityPlayer,
      ownershipEnforcement: 'strict',
    },
    mode: 'discovery',
  };
};

export const createDiscoveryProbeEffectContext = (
  options: RuntimeEffectContextOptions,
): DiscoveryProbeEffectContext => {
  const {
    activePlayer,
    decisionAuthorityPlayer = activePlayer,
    ...ctx
  } = options;
  return {
    ...ctx,
    activePlayer,
    decisionAuthority: {
      source: 'engineRuntime',
      player: decisionAuthorityPlayer,
      ownershipEnforcement: 'probe',
    },
    mode: 'discovery',
  };
};

export const createDiscoveryEffectContext = (
  options: RuntimeEffectContextOptions,
  ownershipEnforcement: 'strict' | 'probe' = 'strict',
): DiscoveryEffectContext =>
  ownershipEnforcement === 'probe'
    ? createDiscoveryProbeEffectContext(options)
    : createDiscoveryStrictEffectContext(options);

export function getMaxEffectOps(ctx: Pick<EffectContext, 'maxEffectOps'>): number {
  return ctx.maxEffectOps ?? DEFAULT_MAX_EFFECT_OPS;
}
