import { getMaxEffectOps, type EffectContext, type EffectResult, type FreeOperationProbeScope } from './effect-context.js';
import { emptyScope } from './decision-scope.js';
import {
  EffectBudgetExceededError,
  effectRuntimeError,
  effectNotImplementedError,
} from './effect-error.js';
import { assertEffectContextEntryInvariant } from './effect-context-invariants.js';
import { perfStart, perfDynEnd } from './perf-profiler.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import type { EffectBudgetState } from './effects-control.js';
import type { EffectAST, TriggerEvent } from './types.js';
import { registry, effectKindOf } from './effect-registry.js';

export const createEffectBudgetState = (ctx: Pick<EffectContext, 'maxEffectOps'>): EffectBudgetState => {
  const maxEffectOps = getMaxEffectOps(ctx);
  if (!Number.isInteger(maxEffectOps) || maxEffectOps < 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.EFFECT_BUDGET_CONFIG_INVALID, 'maxEffectOps must be a non-negative integer', { maxEffectOps });
  }

  return { remaining: maxEffectOps, max: maxEffectOps };
};

export const consumeEffectBudget = (budget: EffectBudgetState, effectType: string): void => {
  if (budget.remaining <= 0) {
    throw new EffectBudgetExceededError('Effect operation budget exceeded', {
      effectType,
      maxEffectOps: budget.max,
    });
  }

  budget.remaining -= 1;
};

const EMPTY_EVENTS: readonly TriggerEvent[] = [];

const applyEffectWithBudget = (effect: EffectAST, ctx: EffectContext, budget: EffectBudgetState): EffectResult => {
  const kind = effectKindOf(effect);
  consumeEffectBudget(budget, kind);
  const handler = registry[kind];
  if (!handler) {
    throw effectNotImplementedError(kind, { effect });
  }
  const profiler = ctx.profiler;
  const t0 = perfStart(profiler);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (handler as any)(effect, ctx, budget, applyEffectsWithBudgetState) as EffectResult;
  perfDynEnd(profiler, `effect:${kind}`, t0);
  // Normalize result: use shared empty array to avoid per-call allocation,
  // apply defaults for bindings/decisionScope only when handler omitted them.
  const emitted = result.emittedEvents ?? EMPTY_EVENTS;
  const bindings = result.bindings ?? ctx.bindings;
  const scope = result.decisionScope ?? ctx.decisionScope;
  if (result.pendingChoice !== undefined) {
    return { state: result.state, rng: result.rng, emittedEvents: emitted, bindings, decisionScope: scope, pendingChoice: result.pendingChoice };
  }
  return { state: result.state, rng: result.rng, emittedEvents: emitted, bindings, decisionScope: scope };
};

export const applyEffectsWithBudgetState = (
  effects: readonly EffectAST[],
  ctx: EffectContext,
  budget: EffectBudgetState,
): EffectResult => {
  let currentState = ctx.state;
  let currentRng = ctx.rng;
  let currentBindings = ctx.bindings;
  let currentDecisionScope = ctx.decisionScope;
  const emittedEvents: TriggerEvent[] = [];
  // Skip effectPath string construction when tracing is disabled
  const tracingEnabled = ctx.collector.trace !== null || ctx.collector.conditionTrace !== null;

  // Clone ctx once into a mutable working context. Property assignments below
  // mutate this single object instead of spreading ~25 fields per iteration.
  // V8 hidden-class safe: same shape as the original spread, same property order.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workCtx: any = { ...ctx };

  for (let effectIndex = 0; effectIndex < effects.length; effectIndex++) {
    // Update only the fields that change between iterations
    workCtx.state = currentState;
    workCtx.rng = currentRng;
    workCtx.bindings = currentBindings;
    workCtx.decisionScope = currentDecisionScope;
    if (tracingEnabled) {
      workCtx.effectPath = `${ctx.effectPath ?? ''}[${effectIndex}]`;
    }
    const result = applyEffectWithBudget(
      effects[effectIndex]!,
      workCtx as EffectContext,
      budget,
    );
    currentState = result.state;
    currentRng = result.rng;
    currentBindings = result.bindings ?? currentBindings;
    currentDecisionScope = result.decisionScope ?? currentDecisionScope;
    if (result.emittedEvents !== undefined && result.emittedEvents.length > 0) {
      for (let i = 0; i < result.emittedEvents.length; i++) emittedEvents.push(result.emittedEvents[i]!);
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

export function applyEffect(effect: EffectAST, ctx: EffectContext): EffectResult {
  assertEffectContextEntryInvariant(ctx);
  const budget = createEffectBudgetState(ctx);
  const freeOperationProbeScope: FreeOperationProbeScope = ctx.freeOperationProbeScope ?? {
    priorGrantDefinitions: [],
    blockedStrictSequenceBatchIds: [],
  };
  const result = applyEffectWithBudget(
    effect,
    { ...ctx, freeOperationProbeScope, decisionScope: ctx.decisionScope ?? emptyScope() },
    budget,
  );
  return {
    state: result.state,
    rng: result.rng,
    ...(result.emittedEvents === undefined ? {} : { emittedEvents: result.emittedEvents }),
    ...(result.bindings === undefined ? {} : { bindings: result.bindings }),
    ...(result.pendingChoice === undefined ? {} : { pendingChoice: result.pendingChoice }),
  };
}

export function applyEffects(effects: readonly EffectAST[], ctx: EffectContext): EffectResult {
  assertEffectContextEntryInvariant(ctx);
  const budget = createEffectBudgetState(ctx);
  const freeOperationProbeScope: FreeOperationProbeScope = ctx.freeOperationProbeScope ?? {
    priorGrantDefinitions: [],
    blockedStrictSequenceBatchIds: [],
  };
  const result = applyEffectsWithBudgetState(
    effects,
    { ...ctx, freeOperationProbeScope, decisionScope: ctx.decisionScope ?? emptyScope() },
    budget,
  );
  return {
    state: result.state,
    rng: result.rng,
    ...(result.emittedEvents === undefined ? {} : { emittedEvents: result.emittedEvents }),
    ...(result.bindings === undefined ? {} : { bindings: result.bindings }),
    ...(result.pendingChoice === undefined ? {} : { pendingChoice: result.pendingChoice }),
  };
}
