import { emptyScope } from './decision-scope.js';
import { createExecutionEffectContext, type EffectEnv, type ExecutionEffectContext } from './effect-context.js';
import type { CompiledEffectContext } from './effect-compiler-types.js';
import type { DecisionAuthorityProbeContext, DecisionAuthorityStrictContext, ExecutionCollector } from './types-core.js';
import type { Rng, GameState } from './types.js';

export const createCompiledExecutionContext = (
  state: GameState,
  rng: Rng,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledEffectContext,
): ExecutionEffectContext => createExecutionEffectContext({
  def: ctx.def,
  adjacencyGraph: ctx.adjacencyGraph,
  runtimeTableIndex: ctx.runtimeTableIndex,
  resources: ctx.resources,
  state,
  rng,
  activePlayer: ctx.activePlayer,
  actorPlayer: ctx.actorPlayer,
  bindings,
  moveParams: ctx.moveParams,
  decisionScope: ctx.decisionScope ?? emptyScope(),
  ...(ctx.traceContext === undefined ? {} : { traceContext: ctx.traceContext }),
  ...(ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath }),
  ...(ctx.maxEffectOps === undefined ? {} : { maxEffectOps: ctx.maxEffectOps }),
  ...(ctx.verifyCompiledEffects === undefined ? {} : { verifyCompiledEffects: ctx.verifyCompiledEffects }),
  ...(ctx.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: ctx.phaseTransitionBudget }),
  ...(ctx.profiler === undefined ? {} : { profiler: ctx.profiler }),
  ...(ctx.cachedRuntime === undefined ? {} : { cachedRuntime: ctx.cachedRuntime }),
});

/**
 * Build an {@link EffectEnv} directly from a {@link CompiledEffectContext}
 * plus the three required fields that `CompiledEffectContext` does not carry.
 *
 * This is the lightweight alternative to {@link createCompiledExecutionContext}:
 * callers that already have an `EffectCursor` can combine the returned env
 * with the cursor via `fromEnvAndCursor` instead of reconstructing a full
 * `ExecutionEffectContext`.
 */
export const buildEffectEnvFromCompiledCtx = (
  ctx: CompiledEffectContext,
  collector: ExecutionCollector,
  decisionAuthority: DecisionAuthorityStrictContext | DecisionAuthorityProbeContext,
  mode: 'execution' | 'discovery',
): EffectEnv => ({
  def: ctx.def,
  adjacencyGraph: ctx.adjacencyGraph,
  resources: ctx.resources,
  activePlayer: ctx.activePlayer,
  actorPlayer: ctx.actorPlayer,
  moveParams: ctx.moveParams,
  collector,
  decisionAuthority,
  mode,
  ...(ctx.runtimeTableIndex === undefined ? {} : { runtimeTableIndex: ctx.runtimeTableIndex }),
  ...(ctx.traceContext === undefined ? {} : { traceContext: ctx.traceContext }),
  ...(ctx.maxEffectOps === undefined ? {} : { maxEffectOps: ctx.maxEffectOps }),
  ...(ctx.verifyCompiledEffects === undefined ? {} : { verifyCompiledEffects: ctx.verifyCompiledEffects }),
  ...(ctx.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: ctx.phaseTransitionBudget }),
  ...(ctx.profiler === undefined ? {} : { profiler: ctx.profiler }),
  ...(ctx.cachedRuntime === undefined ? {} : { cachedRuntime: ctx.cachedRuntime }),
});
