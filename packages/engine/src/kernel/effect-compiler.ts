import { emptyScope } from './decision-scope.js';
import { type EffectCursor } from './effect-context.js';
import { compilePatternDescriptor, type BodyCompiler, type CompiledEffectFragment } from './effect-compiler-codegen.js';
import { classifyEffect, computeCoverageRatio } from './effect-compiler-patterns.js';
import { buildEffectEnvFromCompiledCtx } from './effect-compiler-runtime.js';
import { applyEffectsWithBudgetState, createEffectBudgetState } from './effect-dispatch.js';
import {
  makeCompiledLifecycleEffectKey,
  type CompiledEffectFn,
  type CompiledEffectSequence,
  type CompiledLifecycle,
  type CompiledLifecycleEffectKey,
} from './effect-compiler-types.js';
import { createDraftTracker, createMutableState, freezeState, type MutableGameState } from './state-draft.js';
import type { PhaseId } from './branded.js';
import type { EffectAST, GameDef, GameState, TriggerEvent } from './types.js';

const countEffectNodes = (effects: readonly EffectAST[]): number => {
  let total = 0;
  for (const effect of effects) {
    total += 1;
    if ('if' in effect) {
      total += countEffectNodes(effect.if.then);
      if (effect.if.else !== undefined) {
        total += countEffectNodes(effect.if.else);
      }
    }
    if ('forEach' in effect) {
      total += countEffectNodes(effect.forEach.effects);
      if (effect.forEach.in !== undefined) {
        total += countEffectNodes(effect.forEach.in);
      }
    }
  }
  return total;
};

export const composeFragments = (
  fragments: readonly CompiledEffectFragment[],
): CompiledEffectFn => (state, rng, bindings, ctx) => {
  const compiledCtx = ctx.effectBudget === undefined
    ? { ...ctx, effectBudget: createEffectBudgetState(ctx) }
    : ctx;
  const mutableState = createMutableState(state);
  const tracker = createDraftTracker();
  let currentState: GameState = mutableState as GameState;
  let currentRng = rng;
  let currentBindings = bindings;
  let currentDecisionScope = compiledCtx.decisionScope ?? emptyScope();
  const emittedEvents: TriggerEvent[] = [];

  for (const fragment of fragments) {
    const result = fragment.execute(currentState, currentRng, currentBindings, {
      ...compiledCtx,
      decisionScope: currentDecisionScope,
      tracker,
    });
    currentState = result.state;
    currentRng = result.rng;
    currentBindings = result.bindings ?? currentBindings;
    currentDecisionScope = result.decisionScope ?? currentDecisionScope;
    for (const event of result.emittedEvents ?? []) {
      emittedEvents.push(event);
    }
    if (result.pendingChoice !== undefined) {
      return {
        state: freezeState(currentState as MutableGameState),
        rng: currentRng,
        emittedEvents,
        bindings: currentBindings,
        decisionScope: currentDecisionScope,
        pendingChoice: result.pendingChoice,
      };
    }
  }

  return {
    state: freezeState(currentState as MutableGameState),
    rng: currentRng,
    emittedEvents,
    bindings: currentBindings,
    decisionScope: currentDecisionScope,
  };
};

export const createFallbackFragment = (
  effects: readonly EffectAST[],
): CompiledEffectFragment => ({
  nodeCount: countEffectNodes(effects),
  execute: (state, rng, bindings, ctx) => {
    const env = buildEffectEnvFromCompiledCtx(
      ctx,
      ctx.resources.collector,
      { source: 'engineRuntime' as const, player: ctx.activePlayer, ownershipEnforcement: 'strict' as const },
      'execution',
    );
    const cursor: EffectCursor = {
      state,
      rng,
      bindings,
      decisionScope: ctx.decisionScope ?? emptyScope(),
      ...(ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath }),
      ...(ctx.tracker === undefined ? {} : { tracker: ctx.tracker }),
    };
    const budget = createEffectBudgetState(env);
    return applyEffectsWithBudgetState(effects, env, cursor, budget);
  },
});

const compileFragmentList = (
  effects: readonly EffectAST[],
): CompiledEffectFragment => {
  const fragments: CompiledEffectFragment[] = [];
  let fallbackBatch: EffectAST[] = [];

  const flushFallbackBatch = (): void => {
    if (fallbackBatch.length === 0) {
      return;
    }
    fragments.push(createFallbackFragment(fallbackBatch));
    fallbackBatch = [];
  };

  const compileBody: BodyCompiler = (nestedEffects) => compileFragmentList(nestedEffects);

  for (const effect of effects) {
    const descriptor = classifyEffect(effect);
    if (descriptor === null) {
      fallbackBatch.push(effect);
      continue;
    }

    flushFallbackBatch();
    fragments.push(
      compilePatternDescriptor(descriptor, compileBody)
      ?? createFallbackFragment([effect]),
    );
  }

  flushFallbackBatch();

  return {
    nodeCount: fragments.reduce((sum, fragment) => sum + fragment.nodeCount, 0),
    execute: composeFragments(fragments),
  };
};

export const compileEffectSequence = (
  phaseId: PhaseId,
  lifecycle: CompiledLifecycle,
  effects: readonly EffectAST[],
): CompiledEffectSequence => {
  const fragment = compileFragmentList(effects);
  return {
    phaseId,
    lifecycle,
    execute: fragment.execute,
    coverageRatio: computeCoverageRatio(effects),
  };
};

export const compileAllLifecycleEffects = (
  def: GameDef,
): ReadonlyMap<CompiledLifecycleEffectKey, CompiledEffectSequence> => {
  const compiled = new Map<CompiledLifecycleEffectKey, CompiledEffectSequence>();
  for (const phase of def.turnStructure.phases) {
    if ((phase.onEnter?.length ?? 0) > 0) {
      const sequence = compileEffectSequence(phase.id, 'onEnter', phase.onEnter!);
      compiled.set(makeCompiledLifecycleEffectKey(phase.id, 'onEnter'), sequence);
    }
    if ((phase.onExit?.length ?? 0) > 0) {
      const sequence = compileEffectSequence(phase.id, 'onExit', phase.onExit!);
      compiled.set(makeCompiledLifecycleEffectKey(phase.id, 'onExit'), sequence);
    }
  }
  return compiled;
};
