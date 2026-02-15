import { evalCondition } from './eval-condition.js';
import { evalQuery } from './eval-query.js';
import { evalValue } from './eval-value.js';
import { effectRuntimeError } from './effect-error.js';
import { emitTrace, emitWarning } from './execution-collector.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST, TriggerEvent } from './types.js';

export interface EffectBudgetState {
  remaining: number;
  readonly max: number;
}

type ApplyEffectsWithBudget = (effects: readonly EffectAST[], ctx: EffectContext, budget: EffectBudgetState) => EffectResult;

const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => ({
  ...ctx.moveParams,
  ...ctx.bindings,
});

export const applyIf = (
  effect: Extract<EffectAST, { readonly if: unknown }>,
  ctx: EffectContext,
  budget: EffectBudgetState,
  applyEffectsWithBudget: ApplyEffectsWithBudget,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const predicate = evalCondition(effect.if.when, evalCtx);

  if (predicate) {
    const thenResult = applyEffectsWithBudget(effect.if.then, ctx, budget);
    return {
      state: thenResult.state,
      rng: thenResult.rng,
      ...(thenResult.emittedEvents === undefined ? {} : { emittedEvents: thenResult.emittedEvents }),
      bindings: ctx.bindings,
    };
  }

  if (effect.if.else !== undefined) {
    const elseResult = applyEffectsWithBudget(effect.if.else, ctx, budget);
    return {
      state: elseResult.state,
      rng: elseResult.rng,
      ...(elseResult.emittedEvents === undefined ? {} : { emittedEvents: elseResult.emittedEvents }),
      bindings: ctx.bindings,
    };
  }

  return { state: ctx.state, rng: ctx.rng, bindings: ctx.bindings };
};

export const applyLet = (
  effect: Extract<EffectAST, { readonly let: unknown }>,
  ctx: EffectContext,
  budget: EffectBudgetState,
  applyEffectsWithBudget: ApplyEffectsWithBudget,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedValue = evalValue(effect.let.value, evalCtx);
  const nestedCtx: EffectContext = {
    ...ctx,
    bindings: {
      ...ctx.bindings,
      [effect.let.bind]: evaluatedValue,
    },
  };

  const nestedResult = applyEffectsWithBudget(effect.let.in, nestedCtx, budget);
  return {
    state: nestedResult.state,
    rng: nestedResult.rng,
    ...(nestedResult.emittedEvents === undefined ? {} : { emittedEvents: nestedResult.emittedEvents }),
    bindings: ctx.bindings,
  };
};

export const applyForEach = (
  effect: Extract<EffectAST, { readonly forEach: unknown }>,
  ctx: EffectContext,
  budget: EffectBudgetState,
  applyEffectsWithBudget: ApplyEffectsWithBudget,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };

  let limit: number;
  if (effect.forEach.limit === undefined) {
    limit = 100;
  } else {
    const limitValue = evalValue(effect.forEach.limit, evalCtx);
    if (typeof limitValue !== 'number' || !Number.isSafeInteger(limitValue) || limitValue <= 0) {
      throw effectRuntimeError('controlFlowRuntimeValidationFailed', 'forEach.limit must evaluate to a positive integer', {
        effectType: 'forEach',
        limit: limitValue,
      });
    }
    limit = limitValue;
  }

  const queryResult = evalQuery(effect.forEach.over, evalCtx);

  if (queryResult.length === 0) {
    emitWarning(ctx.collector, {
      code: 'ZERO_EFFECT_ITERATIONS',
      message: `forEach bind=${effect.forEach.bind} matched 0 items in query`,
      context: { bind: effect.forEach.bind },
      hint: 'enable trace:true for effect execution details',
    });
  }

  const boundedItems = queryResult.slice(0, limit);

  if (boundedItems.length === 0 && queryResult.length > 0) {
    emitWarning(ctx.collector, {
      code: 'ZERO_EFFECT_ITERATIONS',
      message: `forEach bind=${effect.forEach.bind} limit=${limit} truncated ${queryResult.length} matches to 0`,
      context: { bind: effect.forEach.bind, limit, matchCount: queryResult.length },
    });
  }

  let currentState = ctx.state;
  let currentRng = ctx.rng;
  const emittedEvents: TriggerEvent[] = [];
  for (const item of boundedItems) {
    const iterationCtx: EffectContext = {
      ...ctx,
      state: currentState,
      rng: currentRng,
      bindings: {
        ...ctx.bindings,
        [effect.forEach.bind]: item,
      },
    };
    const iterationResult = applyEffectsWithBudget(effect.forEach.effects, iterationCtx, budget);
    currentState = iterationResult.state;
    currentRng = iterationResult.rng;
    emittedEvents.push(...(iterationResult.emittedEvents ?? []));
  }

  emitTrace(ctx.collector, {
    kind: 'forEach',
    bind: effect.forEach.bind,
    matchCount: queryResult.length,
    iteratedCount: boundedItems.length,
    ...(effect.forEach.limit !== undefined ? { limit } : {}),
  });

  if (effect.forEach.countBind !== undefined && effect.forEach.in !== undefined) {
    const countCtx: EffectContext = {
      ...ctx,
      state: currentState,
      rng: currentRng,
      bindings: {
        ...ctx.bindings,
        [effect.forEach.countBind]: boundedItems.length,
      },
    };
    const countResult = applyEffectsWithBudget(effect.forEach.in, countCtx, budget);
    currentState = countResult.state;
    currentRng = countResult.rng;
    emittedEvents.push(...(countResult.emittedEvents ?? []));
  }

  return { state: currentState, rng: currentRng, emittedEvents, bindings: ctx.bindings };
};

const resolveRemovalBudget = (budgetExpr: unknown, effectType: string): number => {
  if (typeof budgetExpr !== 'number' || !Number.isSafeInteger(budgetExpr) || budgetExpr < 0) {
    throw effectRuntimeError('controlFlowRuntimeValidationFailed', `${effectType}.budget must evaluate to a non-negative integer`, {
      effectType,
      budget: budgetExpr,
    });
  }
  return budgetExpr;
};

const isTokenLike = (value: unknown): value is { readonly id: string } =>
  typeof value === 'object' && value !== null && 'id' in value && typeof (value as { id: unknown }).id === 'string';

export const applyRemoveByPriority = (
  effect: Extract<EffectAST, { readonly removeByPriority: unknown }>,
  ctx: EffectContext,
  budget: EffectBudgetState,
  applyEffectsWithBudget: ApplyEffectsWithBudget,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  let remainingBudget = resolveRemovalBudget(evalValue(effect.removeByPriority.budget, evalCtx), 'removeByPriority');
  let currentState = ctx.state;
  let currentRng = ctx.rng;
  const emittedEvents: TriggerEvent[] = [];
  const countBindings: Record<string, number> = {};

  for (const group of effect.removeByPriority.groups) {
    let removedInGroup = 0;

    if (remainingBudget > 0) {
      const groupEvalCtx = {
        ...ctx,
        state: currentState,
        rng: currentRng,
        bindings: resolveEffectBindings({ ...ctx, state: currentState, rng: currentRng }),
      };
      const queried = evalQuery(group.over, groupEvalCtx);
      const bounded = queried.slice(0, remainingBudget);

      for (const item of bounded) {
        if (typeof item !== 'string' && !isTokenLike(item)) {
          throw effectRuntimeError('controlFlowRuntimeValidationFailed', 'removeByPriority groups must resolve to token items', {
            effectType: 'removeByPriority',
            bind: group.bind,
            actualType: typeof item,
            value: item,
          });
        }

        const iterationCtx: EffectContext = {
          ...ctx,
          state: currentState,
          rng: currentRng,
          bindings: {
            ...ctx.bindings,
            [group.bind]: item,
          },
        };

        const moveResult = applyEffectsWithBudget(
          [
            {
              moveToken: {
                token: group.bind,
                from: group.from ?? { zoneExpr: { ref: 'tokenZone', token: group.bind } },
                to: group.to,
              },
            },
          ],
          iterationCtx,
          budget,
        );

        currentState = moveResult.state;
        currentRng = moveResult.rng;
        emittedEvents.push(...(moveResult.emittedEvents ?? []));
        removedInGroup += 1;
        remainingBudget -= 1;
        if (remainingBudget === 0) {
          break;
        }
      }
    }

    if (group.countBind !== undefined) {
      countBindings[group.countBind] = removedInGroup;
    }

    if (remainingBudget === 0) {
      continue;
    }
  }

  const exportedBindings: Record<string, unknown> = {
    ...ctx.bindings,
    ...countBindings,
    ...(effect.removeByPriority.remainingBind === undefined ? {} : { [effect.removeByPriority.remainingBind]: remainingBudget }),
  };

  if (effect.removeByPriority.in !== undefined) {
    const inCtx: EffectContext = {
      ...ctx,
      state: currentState,
      rng: currentRng,
      bindings: exportedBindings,
    };

    const inResult = applyEffectsWithBudget(effect.removeByPriority.in, inCtx, budget);
    currentState = inResult.state;
    currentRng = inResult.rng;
    emittedEvents.push(...(inResult.emittedEvents ?? []));
  }

  return { state: currentState, rng: currentRng, emittedEvents, bindings: exportedBindings };
};
