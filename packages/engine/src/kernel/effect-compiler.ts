import { emptyScope } from './decision-scope.js';
import type { EffectResult } from './effect-context.js';
import { compilePatternDescriptor, type BodyCompiler, type CompiledEffectFragment } from './effect-compiler-codegen.js';
import { classifyEffect, computeCoverageRatio } from './effect-compiler-patterns.js';
import { createCompiledExecutionContext } from './effect-compiler-runtime.js';
import {
  makeCompiledLifecycleEffectKey,
  type CompiledEffectFn,
  type CompiledEffectSequence,
  type CompiledLifecycle,
  type CompiledLifecycleEffectKey,
} from './effect-compiler-types.js';
import type { PhaseId } from './branded.js';
import type { EffectAST, GameDef, TriggerEvent } from './types.js';

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

const normalizeFragmentResult = (
  result: EffectResult,
  bindings: Readonly<Record<string, unknown>>,
  decisionScope = emptyScope(),
): EffectResult => ({
  state: result.state,
  rng: result.rng,
  ...(result.emittedEvents === undefined ? {} : { emittedEvents: result.emittedEvents }),
  bindings: result.bindings ?? bindings,
  decisionScope: result.decisionScope ?? decisionScope,
  ...(result.pendingChoice === undefined ? {} : { pendingChoice: result.pendingChoice }),
});

export const composeFragments = (
  fragments: readonly CompiledEffectFragment[],
): CompiledEffectFn => (state, rng, bindings, ctx) => {
  let currentState = state;
  let currentRng = rng;
  let currentBindings = bindings;
  let currentDecisionScope = ctx.decisionScope ?? emptyScope();
  const emittedEvents: TriggerEvent[] = [];

  for (const fragment of fragments) {
    const result = normalizeFragmentResult(
      fragment.execute(currentState, currentRng, currentBindings, {
        ...ctx,
        decisionScope: currentDecisionScope,
      }),
      currentBindings,
      currentDecisionScope,
    );
    currentState = result.state;
    currentRng = result.rng;
    currentBindings = result.bindings ?? currentBindings;
    currentDecisionScope = result.decisionScope ?? currentDecisionScope;
    for (const event of result.emittedEvents ?? []) {
      emittedEvents.push(event);
    }
    if (result.pendingChoice !== undefined) {
      return {
        state: currentState,
        rng: currentRng,
        emittedEvents,
        bindings: currentBindings,
        decisionScope: currentDecisionScope,
        pendingChoice: result.pendingChoice,
      };
    }
  }

  return {
    state: currentState,
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
  execute: (state, rng, bindings, ctx) => normalizeFragmentResult(
    ctx.fallbackApplyEffects(
      effects,
      createCompiledExecutionContext(
        state,
        rng,
        bindings,
        { ...ctx, decisionScope: ctx.decisionScope ?? emptyScope() },
      ),
    ),
    bindings,
    ctx.decisionScope ?? emptyScope(),
  ),
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
