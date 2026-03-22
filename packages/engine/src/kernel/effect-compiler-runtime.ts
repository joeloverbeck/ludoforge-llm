import { emptyScope } from './decision-scope.js';
import { createExecutionEffectContext, type ExecutionEffectContext } from './effect-context.js';
import type { CompiledEffectContext } from './effect-compiler-types.js';
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
});
