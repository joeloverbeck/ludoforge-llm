import { countCombinations, combinations } from './combinatorics.js';
import { evalQuery } from './eval-query.js';
import { evalValue } from './eval-value.js';
import { effectRuntimeError } from './effect-error.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST, TriggerEvent } from './types.js';
import type { EffectBudgetState } from './effects-control.js';

type ApplyEffectsWithBudget = (effects: readonly EffectAST[], ctx: EffectContext, budget: EffectBudgetState) => EffectResult;

const MAX_SUBSET_COMBINATIONS = 10_000;

const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => ({
  ...ctx.moveParams,
  ...ctx.bindings,
});

const resolveSubsetSize = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw effectRuntimeError('subsetRuntimeValidationFailed', 'evaluateSubset.subsetSize must evaluate to a safe integer', {
      effectType: 'evaluateSubset',
      subsetSize: value,
    });
  }
  return value;
};

const resolveScore = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw effectRuntimeError('subsetRuntimeValidationFailed', 'evaluateSubset.scoreExpr must evaluate to a safe integer', {
      effectType: 'evaluateSubset',
      score: value,
    });
  }
  return value;
};

export const applyEvaluateSubset = (
  effect: Extract<EffectAST, { readonly evaluateSubset: unknown }>,
  ctx: EffectContext,
  budget: EffectBudgetState,
  applyEffectsWithBudget: ApplyEffectsWithBudget,
): EffectResult => {
  const evaluateSubset = effect.evaluateSubset;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const items = evalQuery(evaluateSubset.source, evalCtx);
  const subsetSize = resolveSubsetSize(evalValue(evaluateSubset.subsetSize, evalCtx));

  if (subsetSize < 0 || subsetSize > items.length) {
    throw effectRuntimeError('subsetRuntimeValidationFailed', 'evaluateSubset requires 0 <= subsetSize <= source item count', {
      effectType: 'evaluateSubset',
      subsetSize,
      sourceCount: items.length,
    });
  }

  const combinationCount = countCombinations(items.length, subsetSize);
  if (combinationCount > MAX_SUBSET_COMBINATIONS) {
    throw effectRuntimeError('subsetRuntimeValidationFailed', 'evaluateSubset combination count exceeds safety cap', {
      effectType: 'evaluateSubset',
      subsetSize,
      sourceCount: items.length,
      combinationCount,
      maxCombinations: MAX_SUBSET_COMBINATIONS,
    });
  }

  let bestScore = Number.NEGATIVE_INFINITY;
  let bestSubset: readonly unknown[] | null = null;

  for (const subset of combinations(items, subsetSize)) {
    const computeCtx: EffectContext = {
      ...ctx,
      bindings: {
        ...ctx.bindings,
        [evaluateSubset.subsetBind]: subset,
      },
    };

    const computeResult = applyEffectsWithBudget(evaluateSubset.compute, computeCtx, budget);
    if (computeResult.pendingChoice !== undefined) {
      return {
        state: computeResult.state,
        rng: computeResult.rng,
        ...(computeResult.emittedEvents === undefined ? {} : { emittedEvents: computeResult.emittedEvents }),
        bindings: ctx.bindings,
        pendingChoice: computeResult.pendingChoice,
      };
    }
    const scoreCtx = {
      ...ctx,
      state: computeResult.state,
      rng: computeResult.rng,
      bindings: resolveEffectBindings({
        ...ctx,
        state: computeResult.state,
        rng: computeResult.rng,
        bindings: computeResult.bindings ?? computeCtx.bindings,
      }),
    };
    const score = resolveScore(evalValue(evaluateSubset.scoreExpr, scoreCtx));

    if (score > bestScore) {
      bestScore = score;
      bestSubset = subset;
    }
  }

  if (bestSubset === null) {
    throw effectRuntimeError('subsetRuntimeValidationFailed', 'evaluateSubset could not evaluate any subset', {
      effectType: 'evaluateSubset',
      subsetSize,
      sourceCount: items.length,
    });
  }

  const exportedBindings: Record<string, unknown> = {
    ...ctx.bindings,
    [evaluateSubset.resultBind]: bestScore,
    ...(evaluateSubset.bestSubsetBind === undefined ? {} : { [evaluateSubset.bestSubsetBind]: bestSubset }),
  };

  const inCtx: EffectContext = {
    ...ctx,
    bindings: exportedBindings,
  };
  const inResult = applyEffectsWithBudget(evaluateSubset.in, inCtx, budget);
  if (inResult.pendingChoice !== undefined) {
    return {
      state: inResult.state,
      rng: inResult.rng,
      ...(inResult.emittedEvents === undefined ? {} : { emittedEvents: inResult.emittedEvents }),
      bindings: exportedBindings,
      pendingChoice: inResult.pendingChoice,
    };
  }

  const emittedEvents: TriggerEvent[] = [];
  emittedEvents.push(...(inResult.emittedEvents ?? []));

  return {
    state: inResult.state,
    rng: inResult.rng,
    emittedEvents,
    bindings: exportedBindings,
  };
};
