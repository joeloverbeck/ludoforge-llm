import type { PhaseId, PlayerId } from './branded.js';
import type {
  EffectContext,
  EffectResult,
  EffectTraceContext,
  PhaseTransitionBudget,
} from './effect-context.js';
import type { DecisionScope } from './decision-scope.js';
import type { EvalRuntimeResources } from './eval-context.js';
import type { EffectBudgetState } from './effects-control.js';
import type { PerfProfiler } from './perf-profiler.js';
import type { AdjacencyGraph } from './spatial.js';
import type { RuntimeTableIndex } from './runtime-table-index.js';
import type { EffectAST, GameDef, GameState, MoveParamValue, Rng } from './types.js';

export type CompiledLifecycle = 'onEnter' | 'onExit';

export type CompiledLifecycleEffectKey = `${string}:${CompiledLifecycle}`;

export interface CompiledEffectSequence {
  readonly phaseId: PhaseId;
  readonly lifecycle: CompiledLifecycle;
  readonly execute: CompiledEffectFn;
  readonly coverageRatio: number;
}

export type CompiledEffectFn = (
  state: GameState,
  rng: Rng,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledEffectContext,
) => EffectResult;

export interface CompiledEffectContext {
  readonly def: GameDef;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly runtimeTableIndex: RuntimeTableIndex;
  readonly resources: EvalRuntimeResources;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly moveParams: Readonly<Record<string, MoveParamValue>>;
  readonly fallbackApplyEffects: (effects: readonly EffectAST[], ctx: EffectContext) => EffectResult;
  readonly traceContext?: EffectTraceContext;
  readonly decisionScope?: DecisionScope;
  readonly effectPath?: string;
  readonly maxEffectOps?: number;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  readonly profiler?: PerfProfiler;
  readonly effectBudget?: EffectBudgetState;
}

export const makeCompiledLifecycleEffectKey = (
  phaseId: PhaseId,
  lifecycle: CompiledLifecycle,
): CompiledLifecycleEffectKey => `${phaseId}:${lifecycle}`;
