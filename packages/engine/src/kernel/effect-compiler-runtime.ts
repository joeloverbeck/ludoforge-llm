import { emptyScope } from './decision-scope.js';
import { createExecutionEffectContext, type EffectEnv, type ExecutionEffectContext } from './effect-context.js';
import { createEffectBudgetState } from './effect-dispatch.js';
import type { CompiledEffectContext, CompiledExecutionContext } from './effect-compiler-types.js';
import type { DraftTracker } from './state-draft.js';
import type { ExecutionCollector } from './types-core.js';
import type { Rng, GameState } from './types.js';

export const promoteCompiledEffectContext = (
  ctx: CompiledEffectContext,
  tracker: DraftTracker,
): CompiledExecutionContext => ({
  ...ctx,
  decisionScope: ctx.decisionScope ?? emptyScope(),
  effectBudget: ctx.effectBudget ?? createEffectBudgetState(ctx),
  tracker,
  mode: ctx.mode,
  decisionAuthority: ctx.decisionAuthority,
});

export const createExecutionContextFromCompiled = (
  state: GameState,
  rng: Rng,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledExecutionContext,
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
  decisionScope: ctx.decisionScope,
  ...(ctx.traceContext === undefined ? {} : { traceContext: ctx.traceContext }),
  ...(ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath }),
  ...(ctx.maxEffectOps === undefined ? {} : { maxEffectOps: ctx.maxEffectOps }),
  ...(ctx.verifyCompiledEffects === undefined ? {} : { verifyCompiledEffects: ctx.verifyCompiledEffects }),
  ...(ctx.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: ctx.phaseTransitionBudget }),
  ...(ctx.profiler === undefined ? {} : { profiler: ctx.profiler }),
  ...(ctx.cachedRuntime === undefined ? {} : { cachedRuntime: ctx.cachedRuntime }),
});

/**
 * Build an {@link EffectEnv} directly from a required compiled execution context.
 *
 * This is the lightweight alternative to {@link createExecutionContextFromCompiled}:
 * callers that already have an `EffectCursor` can combine the returned env
 * with narrow env/cursor bridge helpers instead of reconstructing a full
 * `ExecutionEffectContext`.
 */
export const buildEffectEnvFromCompiledCtx = (
  ctx: CompiledExecutionContext,
  collector: ExecutionCollector,
): EffectEnv => ({
  def: ctx.def,
  adjacencyGraph: ctx.adjacencyGraph,
  resources: ctx.resources,
  activePlayer: ctx.activePlayer,
  actorPlayer: ctx.actorPlayer,
  moveParams: ctx.moveParams,
  collector,
  decisionAuthority: ctx.decisionAuthority,
  mode: ctx.mode,
  ...(ctx.runtimeTableIndex === undefined ? {} : { runtimeTableIndex: ctx.runtimeTableIndex }),
  ...(ctx.traceContext === undefined ? {} : { traceContext: ctx.traceContext }),
  ...(ctx.maxEffectOps === undefined ? {} : { maxEffectOps: ctx.maxEffectOps }),
  ...(ctx.verifyCompiledEffects === undefined ? {} : { verifyCompiledEffects: ctx.verifyCompiledEffects }),
  ...(ctx.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: ctx.phaseTransitionBudget }),
  ...(ctx.profiler === undefined ? {} : { profiler: ctx.profiler }),
  ...(ctx.cachedRuntime === undefined ? {} : { cachedRuntime: ctx.cachedRuntime }),
  ...(ctx.transientDecisionSelections === undefined ? {} : { transientDecisionSelections: ctx.transientDecisionSelections }),
  ...(ctx.chooseNTemplateCallback === undefined ? {} : { chooseNTemplateCallback: ctx.chooseNTemplateCallback }),
});
