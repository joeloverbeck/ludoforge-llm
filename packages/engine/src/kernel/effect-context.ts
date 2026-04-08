import type { PlayerId } from './branded.js';
import type { ChoiceValidationError } from './choice-validation-result.js';
import type { ChooseNTemplate } from './choose-n-session.js';
import { emptyScope, type DecisionScope } from './decision-scope.js';
import type { DraftTracker } from './state-draft.js';
import type { FreeOperationExecutionOverlay } from './free-operation-overlay.js';
import type { RuntimeTableIndex } from './runtime-table-index.js';
import type { AdjacencyGraph } from './spatial.js';
import type {
  DecisionAuthorityProbeContext,
  DecisionAuthorityStrictContext,
} from './types-core.js';
import {
  type EvalRuntimeResources,
  type ReadContext,
} from './eval-context.js';
import type {
  ChoicePendingRequest,
  ExecutionCollector,
  ChoiceStochasticPendingRequest,
  GameDef,
  EffectTraceEventContext,
  GameState,
  MoveParamScalar,
  MoveParamValue,
  Rng,
  TriggerEvent,
  TurnFlowFreeOperationGrantContract,
} from './types.js';

export const DEFAULT_MAX_EFFECT_OPS = 10_000;

export interface PhaseTransitionBudget {
  remaining: number;
}

export interface FreeOperationProbeScope {
  readonly priorGrantDefinitions: TurnFlowFreeOperationGrantContract[];
  readonly blockedStrictSequenceBatchIds: string[];
}

export interface EffectTraceContext {
  readonly eventContext: EffectTraceEventContext;
  readonly actionId?: string;
  readonly effectPathRoot: string;
}

export interface WriteContext extends ReadContext {
  readonly rng: Rng;
  readonly moveParams: Readonly<Record<string, MoveParamValue>>;
}

interface EffectContextBase extends WriteContext {
  readonly traceContext?: EffectTraceContext;
  readonly effectPath?: string;
  readonly maxEffectOps?: number;
  readonly verifyCompiledEffects?: boolean;
  readonly freeOperation?: boolean;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  readonly cachedRuntime?: import('./gamedef-runtime.js').GameDefRuntime;
  readonly transientDecisionSelections?: Readonly<Record<string, readonly MoveParamScalar[]>>;
  readonly decisionScope: DecisionScope;
  /** Runtime scope carrying previously executed grant definitions for sequence viability probes. */
  readonly freeOperationProbeScope?: FreeOperationProbeScope;
  /** Callback invoked during discovery when a chooseN pending choice is created, delivering the full-fidelity template. */
  readonly chooseNTemplateCallback?: (template: ChooseNTemplate) => void;
  /** Opt-in profiler for per-effect-type timing. Measurement side-channel only. */
  readonly profiler?: import('./perf-profiler.js').PerfProfiler;
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

export interface PartialEffectResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents?: readonly TriggerEvent[];
  readonly bindings?: Readonly<Record<string, unknown>>;
  readonly pendingChoice?: ChoicePendingRequest | ChoiceStochasticPendingRequest;
  readonly decisionScope?: DecisionScope;
  readonly choiceValidationError?: ChoiceValidationError;
}

export interface NormalizedEffectResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents: readonly TriggerEvent[];
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly pendingChoice?: ChoicePendingRequest | ChoiceStochasticPendingRequest;
  readonly decisionScope: DecisionScope;
  readonly choiceValidationError?: ChoiceValidationError;
}

interface RuntimeEffectContextOptions extends Omit<
  EffectContextBase,
  'collector' | 'resources' | 'decisionScope' | 'runtimeTableIndex' | 'freeOperationOverlay' | 'maxQueryResults'
> {
  readonly resources: EvalRuntimeResources;
  readonly decisionAuthorityPlayer?: PlayerId;
  readonly decisionScope?: DecisionScope;
  readonly runtimeTableIndex?: RuntimeTableIndex | undefined;
  readonly freeOperationOverlay?: FreeOperationExecutionOverlay | undefined;
  readonly maxQueryResults?: number | undefined;
}

export const createExecutionEffectContext = (options: RuntimeEffectContextOptions): ExecutionEffectContext => {
  const {
    activePlayer,
    resources,
    decisionAuthorityPlayer = activePlayer,
    ...ctx
  } = options;
  return {
    ...ctx,
    activePlayer,
    resources,
    runtimeTableIndex: ctx.runtimeTableIndex,
    freeOperationOverlay: ctx.freeOperationOverlay,
    maxQueryResults: ctx.maxQueryResults,
    collector: resources.collector,
    decisionAuthority: {
      source: 'engineRuntime',
      player: decisionAuthorityPlayer,
      ownershipEnforcement: 'strict',
    },
    decisionScope: ctx.decisionScope ?? emptyScope(),
    mode: 'execution',
  };
};

export const createDiscoveryStrictEffectContext = (options: RuntimeEffectContextOptions): DiscoveryStrictEffectContext => {
  const {
    activePlayer,
    resources,
    decisionAuthorityPlayer = activePlayer,
    ...ctx
  } = options;
  return {
    ...ctx,
    activePlayer,
    resources,
    runtimeTableIndex: ctx.runtimeTableIndex,
    freeOperationOverlay: ctx.freeOperationOverlay,
    maxQueryResults: ctx.maxQueryResults,
    collector: resources.collector,
    decisionAuthority: {
      source: 'engineRuntime',
      player: decisionAuthorityPlayer,
      ownershipEnforcement: 'strict',
    },
    decisionScope: ctx.decisionScope ?? emptyScope(),
    mode: 'discovery',
  };
};

export const createDiscoveryProbeEffectContext = (
  options: RuntimeEffectContextOptions,
): DiscoveryProbeEffectContext => {
  const {
    activePlayer,
    resources,
    decisionAuthorityPlayer = activePlayer,
    ...ctx
  } = options;
  return {
    ...ctx,
    activePlayer,
    resources,
    runtimeTableIndex: ctx.runtimeTableIndex,
    freeOperationOverlay: ctx.freeOperationOverlay,
    maxQueryResults: ctx.maxQueryResults,
    collector: resources.collector,
    decisionAuthority: {
      source: 'engineRuntime',
      player: decisionAuthorityPlayer,
      ownershipEnforcement: 'probe',
    },
    decisionScope: ctx.decisionScope ?? emptyScope(),
    mode: 'discovery',
  };
};

export function getMaxEffectOps(ctx: Pick<EffectContext, 'maxEffectOps'>): number {
  return ctx.maxEffectOps ?? DEFAULT_MAX_EFFECT_OPS;
}

// ---------------------------------------------------------------------------
// Spec 77 — EffectContext static/dynamic split
// ---------------------------------------------------------------------------

/**
 * Fields that are constant throughout a single applyEffects call.
 * Created once, shared by reference across all effects in the sequence.
 */
export interface EffectEnv {
  // -- ReadContext fields --
  readonly def: import('./types.js').GameDef;
  readonly adjacencyGraph: import('./spatial.js').AdjacencyGraph;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly resources: EvalRuntimeResources;
  readonly runtimeTableIndex?: import('./runtime-table-index.js').RuntimeTableIndex;
  readonly freeOperationOverlay?: import('./free-operation-overlay.js').FreeOperationExecutionOverlay;
  readonly maxQueryResults?: number;
  readonly collector: import('./types.js').ExecutionCollector;
  // -- WriteContext field --
  readonly moveParams: Readonly<Record<string, MoveParamValue>>;
  // -- EffectContextBase fields --
  readonly traceContext?: EffectTraceContext;
  readonly maxEffectOps?: number;
  readonly verifyCompiledEffects?: boolean;
  readonly freeOperation?: boolean;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  readonly cachedRuntime?: import('./gamedef-runtime.js').GameDefRuntime;
  readonly transientDecisionSelections?: Readonly<Record<string, readonly MoveParamScalar[]>>;
  readonly freeOperationProbeScope?: FreeOperationProbeScope;
  readonly chooseNTemplateCallback?: (template: ChooseNTemplate) => void;
  readonly profiler?: import('./perf-profiler.js').PerfProfiler;
  // -- Mode / authority --
  readonly decisionAuthority: DecisionAuthorityStrictContext | DecisionAuthorityProbeContext;
  readonly mode: 'execution' | 'discovery';
}

/**
 * Fields that change between effects in an execution sequence.
 * Small enough to clone cheaply for nested scopes (5 fields vs ~24).
 */
export interface EffectCursor {
  state: GameState;
  rng: Rng;
  bindings: Readonly<Record<string, unknown>>;
  decisionScope: DecisionScope;
  effectPath: string | undefined;
  /** Present when inside a mutable-state scope (Spec 78 draft execution). */
  tracker?: DraftTracker;
}

export interface MutableReadScope {
  def: GameDef;
  adjacencyGraph: AdjacencyGraph;
  state: GameState;
  activePlayer: PlayerId;
  actorPlayer: PlayerId;
  bindings: Readonly<Record<string, unknown>>;
  resources: EvalRuntimeResources;
  runtimeTableIndex: RuntimeTableIndex | undefined;
  freeOperationOverlay: FreeOperationExecutionOverlay | undefined;
  maxQueryResults: number | undefined;
  collector: ExecutionCollector;
}

/** Extract the static environment from a full EffectContext. */
export const toEffectEnv = (ctx: EffectContext): EffectEnv => {
  // Destructure out cursor fields; the rest is the env.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { state: _s, rng: _r, bindings: _b, decisionScope: _d, effectPath: _e, ...env } = ctx;
  return env as EffectEnv;
};

/** Extract the dynamic cursor from a full EffectContext. */
export const toEffectCursor = (ctx: EffectContext): EffectCursor => ({
  state: ctx.state,
  rng: ctx.rng,
  bindings: ctx.bindings,
  decisionScope: ctx.decisionScope,
  effectPath: ctx.effectPath,
});

export interface TraceProvenanceContext {
  readonly state: GameState;
  readonly traceContext: EffectTraceContext | undefined;
  readonly effectPath: string | undefined;
}

export interface TraceEmissionContext extends TraceProvenanceContext {
  readonly collector: import('./types.js').ExecutionCollector;
}

export const toTraceProvenanceContext = (
  env: Pick<EffectEnv, 'traceContext'>,
  cursor: Pick<EffectCursor, 'state' | 'effectPath'>,
): TraceProvenanceContext => ({
  state: cursor.state,
  traceContext: env.traceContext,
  effectPath: cursor.effectPath,
});

export const toTraceEmissionContext = (
  env: Pick<EffectEnv, 'collector' | 'traceContext'>,
  cursor: Pick<EffectCursor, 'state' | 'effectPath'>,
): TraceEmissionContext => ({
  collector: env.collector,
  state: cursor.state,
  traceContext: env.traceContext,
  effectPath: cursor.effectPath,
});

/**
 * Merge moveParams into bindings. Shared utility replacing per-file duplicates.
 * Fast path: return bindings directly when moveParams is empty.
 */
export const resolveEffectBindings = (env: EffectEnv, cursor: EffectCursor): Readonly<Record<string, unknown>> => {
  const mp = env.moveParams;
  for (const key in mp) {
    void key;
    return { ...mp, ...cursor.bindings };
  }
  return cursor.bindings;
};

export const createMutableReadScope = (env: EffectEnv, cursor: EffectCursor): MutableReadScope => ({
  def: env.def,
  adjacencyGraph: env.adjacencyGraph,
  state: cursor.state,
  activePlayer: env.activePlayer,
  actorPlayer: env.actorPlayer,
  bindings: resolveEffectBindings(env, cursor),
  resources: env.resources,
  runtimeTableIndex: env.runtimeTableIndex,
  freeOperationOverlay: env.freeOperationOverlay,
  maxQueryResults: env.maxQueryResults,
  collector: env.collector,
});

export const updateReadScope = (
  scope: MutableReadScope,
  cursor: EffectCursor,
  env: EffectEnv,
): void => {
  scope.state = cursor.state;
  scope.bindings = resolveEffectBindings(env, cursor);
};

export const updateReadScopeRaw = (scope: MutableReadScope, cursor: EffectCursor): void => {
  scope.state = cursor.state;
  scope.bindings = cursor.bindings;
};
