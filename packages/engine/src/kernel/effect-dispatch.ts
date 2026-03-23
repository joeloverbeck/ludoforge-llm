import {
  getMaxEffectOps,
  toEffectEnv,
  toEffectCursor,
  type EffectContext,
  type EffectCursor,
  type EffectEnv,
  type EffectResult,
  type FreeOperationProbeScope,
} from './effect-context.js';
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

const applyEffectWithBudget = (
  effect: EffectAST,
  env: EffectEnv,
  cursor: EffectCursor,
  budget: EffectBudgetState,
): EffectResult => {
  const kind = effectKindOf(effect);
  consumeEffectBudget(budget, kind);
  const handler = registry[kind];
  if (!handler) {
    throw effectNotImplementedError(kind, { effect });
  }
  const profiler = env.profiler;
  const t0 = perfStart(profiler);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (handler as any)(effect, env, cursor, budget, applyEffectsWithBudgetState) as EffectResult;
  perfDynEnd(profiler, `effect:${kind}`, t0);
  // Normalize result: use shared empty array to avoid per-call allocation,
  // apply defaults for bindings/decisionScope only when handler omitted them.
  const emitted = result.emittedEvents ?? EMPTY_EVENTS;
  const bindings = result.bindings ?? cursor.bindings;
  const scope = result.decisionScope ?? cursor.decisionScope;
  if (result.pendingChoice !== undefined) {
    return { state: result.state, rng: result.rng, emittedEvents: emitted, bindings, decisionScope: scope, pendingChoice: result.pendingChoice };
  }
  return { state: result.state, rng: result.rng, emittedEvents: emitted, bindings, decisionScope: scope };
};

export const applyEffectsWithBudgetState = (
  effects: readonly EffectAST[],
  env: EffectEnv,
  cursor: EffectCursor,
  budget: EffectBudgetState,
): EffectResult => {
  let currentState = cursor.state;
  let currentRng = cursor.rng;
  let currentBindings = cursor.bindings;
  let currentDecisionScope = cursor.decisionScope;
  const emittedEvents: TriggerEvent[] = [];
  // Skip effectPath string construction when tracing is disabled
  const tracingEnabled = env.collector.trace !== null || env.collector.conditionTrace !== null;

  // Reusable mutable cursor — mutated in place between iterations.
  // Only 5 fields instead of the previous ~25-field workCtx spread.
  const workCursor: EffectCursor = { ...cursor };

  for (let effectIndex = 0; effectIndex < effects.length; effectIndex++) {
    // Update only the fields that change between iterations
    workCursor.state = currentState;
    workCursor.rng = currentRng;
    workCursor.bindings = currentBindings;
    workCursor.decisionScope = currentDecisionScope;
    if (tracingEnabled) {
      workCursor.effectPath = `${cursor.effectPath ?? ''}[${effectIndex}]`;
    }
    const result = applyEffectWithBudget(
      effects[effectIndex]!,
      env,
      workCursor,
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
  const fullCtx = { ...ctx, freeOperationProbeScope, decisionScope: ctx.decisionScope ?? emptyScope() };
  const env = toEffectEnv(fullCtx);
  const cursor = toEffectCursor(fullCtx);
  const result = applyEffectWithBudget(effect, env, cursor, budget);
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
  const fullCtx = { ...ctx, freeOperationProbeScope, decisionScope: ctx.decisionScope ?? emptyScope() };
  const env = toEffectEnv(fullCtx);
  const cursor = toEffectCursor(fullCtx);
  const result = applyEffectsWithBudgetState(effects, env, cursor, budget);
  return {
    state: result.state,
    rng: result.rng,
    ...(result.emittedEvents === undefined ? {} : { emittedEvents: result.emittedEvents }),
    ...(result.bindings === undefined ? {} : { bindings: result.bindings }),
    ...(result.pendingChoice === undefined ? {} : { pendingChoice: result.pendingChoice }),
  };
}
