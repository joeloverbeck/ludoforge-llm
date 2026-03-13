import { getMaxEffectOps, type EffectContext, type EffectResult, type FreeOperationProbeScope } from './effect-context.js';
import {
  EffectBudgetExceededError,
  effectRuntimeError,
  effectNotImplementedError,
} from './effect-error.js';
import { assertEffectContextEntryInvariant } from './effect-context-invariants.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import type { EffectBudgetState } from './effects-control.js';
import type { EffectAST, TriggerEvent } from './types.js';
import { registry, effectKindOf } from './effect-registry.js';

const createBudgetState = (ctx: Pick<EffectContext, 'maxEffectOps'>): EffectBudgetState => {
  const maxEffectOps = getMaxEffectOps(ctx);
  if (!Number.isInteger(maxEffectOps) || maxEffectOps < 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.EFFECT_BUDGET_CONFIG_INVALID, 'maxEffectOps must be a non-negative integer', { maxEffectOps });
  }

  return { remaining: maxEffectOps, max: maxEffectOps };
};

const consumeBudget = (budget: EffectBudgetState, effectType: string): void => {
  if (budget.remaining <= 0) {
    throw new EffectBudgetExceededError('Effect operation budget exceeded', {
      effectType,
      maxEffectOps: budget.max,
    });
  }

  budget.remaining -= 1;
};

const dispatchEffect = (effect: EffectAST, ctx: EffectContext, budget: EffectBudgetState): EffectResult => {
  const kind = effectKindOf(effect);
  const handler = registry[kind];
  if (!handler) {
    throw effectNotImplementedError(kind, { effect });
  }
  // Safe cast: registry construction guarantees type-correct handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (handler as any)(effect, ctx, budget, applyEffectsWithBudget);
};

const applyEffectWithBudget = (effect: EffectAST, ctx: EffectContext, budget: EffectBudgetState): EffectResult => {
  const effectType = effectKindOf(effect);
  consumeBudget(budget, effectType);
  const result = dispatchEffect(effect, ctx, budget);
  return {
    state: result.state,
    rng: result.rng,
    emittedEvents: result.emittedEvents ?? [],
    bindings: result.bindings ?? ctx.bindings,
    ...(result.pendingChoice === undefined ? {} : { pendingChoice: result.pendingChoice }),
  };
};

const applyEffectsWithBudget = (effects: readonly EffectAST[], ctx: EffectContext, budget: EffectBudgetState): EffectResult => {
  let currentState = ctx.state;
  let currentRng = ctx.rng;
  let currentBindings = ctx.bindings;
  const emittedEvents: TriggerEvent[] = [];

  for (const [effectIndex, effect] of effects.entries()) {
    const result = applyEffectWithBudget(
      effect,
      {
        ...ctx,
        state: currentState,
        rng: currentRng,
        bindings: currentBindings,
        effectPath: `${ctx.effectPath ?? ''}[${effectIndex}]`,
      },
      budget,
    );
    currentState = result.state;
    currentRng = result.rng;
    currentBindings = result.bindings ?? currentBindings;
    emittedEvents.push(...(result.emittedEvents ?? []));
    if (result.pendingChoice !== undefined) {
      return { state: currentState, rng: currentRng, emittedEvents, bindings: currentBindings, pendingChoice: result.pendingChoice };
    }
  }

  return { state: currentState, rng: currentRng, emittedEvents, bindings: currentBindings };
};

export function applyEffect(effect: EffectAST, ctx: EffectContext): EffectResult {
  assertEffectContextEntryInvariant(ctx);
  const budget = createBudgetState(ctx);
  const freeOperationProbeScope: FreeOperationProbeScope = ctx.freeOperationProbeScope ?? {
    priorGrantDefinitions: [],
    blockedStrictSequenceBatchIds: [],
  };
  const result = applyEffectWithBudget(effect, { ...ctx, freeOperationProbeScope }, budget);
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
  const budget = createBudgetState(ctx);
  const freeOperationProbeScope: FreeOperationProbeScope = ctx.freeOperationProbeScope ?? {
    priorGrantDefinitions: [],
    blockedStrictSequenceBatchIds: [],
  };
  const result = applyEffectsWithBudget(effects, { ...ctx, freeOperationProbeScope }, budget);
  return {
    state: result.state,
    rng: result.rng,
    ...(result.emittedEvents === undefined ? {} : { emittedEvents: result.emittedEvents }),
    ...(result.bindings === undefined ? {} : { bindings: result.bindings }),
    ...(result.pendingChoice === undefined ? {} : { pendingChoice: result.pendingChoice }),
  };
}
