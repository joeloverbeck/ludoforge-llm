import {
  getMaxEffectOps,
  toEffectEnv,
  toEffectCursor,
  type EffectContext,
  type EffectCursor,
  type EffectEnv,
  type NormalizedEffectResult,
  type PartialEffectResult,
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
import type { EffectAST, EffectKindTag, GameState, TriggerEvent } from './types.js';
import { registry, TAG_TO_KIND } from './effect-registry.js';
import { createMutableState, createDraftTracker } from './state-draft.js';

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

// Build dispatch array lazily on first use to avoid circular-init issues.
// TAG_TO_KIND maps each numeric tag to its EffectKind string; we use that
// to pull the corresponding handler from the registry. The result is an
// array where dispatchTable[tag] is the handler function for that tag.
type DispatchFn = (effect: EffectAST, env: EffectEnv, cursor: EffectCursor, budget: EffectBudgetState, applyBatch: typeof applyEffectsWithBudgetState) => PartialEffectResult;
let _dispatchTable: readonly DispatchFn[] | null = null;
const getDispatchTable = (): readonly DispatchFn[] => {
  if (_dispatchTable === null) {
    _dispatchTable = TAG_TO_KIND.map((kind) => registry[kind] as DispatchFn);
  }
  return _dispatchTable;
};

const applyEffectWithBudget = (
  effect: EffectAST,
  env: EffectEnv,
  cursor: EffectCursor,
  budget: EffectBudgetState,
): NormalizedEffectResult => {
  const tag = (effect as { readonly _k: EffectKindTag })._k;
  const kind = TAG_TO_KIND[tag]!;
  consumeEffectBudget(budget, kind);
  const handler = getDispatchTable()[tag];
  if (!handler) {
    throw effectNotImplementedError(kind, { effect });
  }
  const profiler = env.profiler;
  const t0 = perfStart(profiler);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (handler as any)(effect, env, cursor, budget, applyEffectsWithBudgetState) as PartialEffectResult;
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
): NormalizedEffectResult => {
  // Reuse parent scope's mutable state + tracker when already in a scope
  // (cursor.tracker is set by the parent). Only create fresh clones at
  // the outermost scope entry (cursor.tracker is undefined).
  const isNestedScope = cursor.tracker !== undefined;
  const tracker = isNestedScope ? cursor.tracker! : createDraftTracker();
  let currentState: GameState = isNestedScope ? cursor.state : createMutableState(cursor.state) as GameState;
  let currentRng = cursor.rng;
  let currentBindings = cursor.bindings;
  let currentDecisionScope = cursor.decisionScope;
  const emittedEvents: TriggerEvent[] = [];
  // Skip effectPath string construction when tracing is disabled
  const tracingEnabled = env.collector.trace !== null || env.collector.conditionTrace !== null;

  // Reusable mutable cursor — mutated in place between iterations.
  // Only 5 fields instead of the previous ~25-field workCtx spread.
  // Tracker is set once (stable for the scope) so handlers can access it.
  // Always create a fresh object — the parent may share the same cursor reference
  // when tracing is disabled (withCursorTrace returns cursor unchanged).
  const workCursor: EffectCursor = { ...cursor, tracker };

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
    currentBindings = result.bindings;
    currentDecisionScope = result.decisionScope;
    if (result.emittedEvents.length > 0) {
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

export function applyEffect(effect: EffectAST, ctx: EffectContext): NormalizedEffectResult {
  assertEffectContextEntryInvariant(ctx);
  const budget = createEffectBudgetState(ctx);
  const freeOperationProbeScope: FreeOperationProbeScope = ctx.freeOperationProbeScope ?? {
    priorGrantDefinitions: [],
    blockedStrictSequenceBatchIds: [],
  };
  const fullCtx = { ...ctx, freeOperationProbeScope, decisionScope: ctx.decisionScope ?? emptyScope() };
  const env = toEffectEnv(fullCtx);
  const cursor = toEffectCursor(fullCtx);
  return applyEffectWithBudget(effect, env, cursor, budget);
}

export function applyEffects(effects: readonly EffectAST[], ctx: EffectContext): NormalizedEffectResult {
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
  return result;
}
