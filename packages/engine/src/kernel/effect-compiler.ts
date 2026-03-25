import { emptyScope } from './decision-scope.js';
import { compilePatternDescriptor, type BodyCompiler, type CompiledEffectFragment } from './effect-compiler-codegen.js';
import { classifyLifecycleEffect, computeCoverageRatio } from './effect-compiler-patterns.js';
import { createEffectBudgetState } from './effect-dispatch.js';
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

const compileFragmentList = (
  effects: readonly EffectAST[],
): CompiledEffectFragment => {
  const fragments: CompiledEffectFragment[] = [];
  const compileBody: BodyCompiler = (nestedEffects) => compileFragmentList(nestedEffects);

  for (const effect of effects) {
    fragments.push(compilePatternDescriptor(classifyLifecycleEffect(effect), compileBody));
  }

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
  const coverageRatio = computeCoverageRatio(effects);
  if (coverageRatio !== 1) {
    throw new Error(
      `Lifecycle effect compilation for ${String(phaseId)}:${lifecycle} must have full coverage; received ${coverageRatio}`,
    );
  }

  return {
    phaseId,
    lifecycle,
    execute: fragment.execute,
    coverageRatio,
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
