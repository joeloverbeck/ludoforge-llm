import { countCombinations, combinations } from './combinatorics.js';
import { evalQuery } from './eval-query.js';
import { evalValue } from './eval-value.js';
import { effectRuntimeError } from './effect-error.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import type { EffectCursor, EffectEnv, MutableReadScope, PartialEffectResult } from './effect-context.js';
import { mergeToEvalContext, mergeToReadContext, resolveEffectBindings } from './effect-context.js';
import type { EffectAST, TriggerEvent } from './types.js';
import type { EffectBudgetState } from './effects-control.js';
import type { ApplyEffectsWithBudget } from './effect-registry.js';

const MAX_SUBSET_COMBINATIONS = 10_000;

const resolveSubsetSize = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.SUBSET_RUNTIME_VALIDATION_FAILED, 'evaluateSubset.subsetSize must evaluate to a safe integer', {
      effectType: 'evaluateSubset',
      subsetSize: value,
    });
  }
  return value;
};

const resolveScore = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.SUBSET_RUNTIME_VALIDATION_FAILED, 'evaluateSubset.scoreExpr must evaluate to a safe integer', {
      effectType: 'evaluateSubset',
      score: value,
    });
  }
  return value;
};

export const applyEvaluateSubset = (
  effect: Extract<EffectAST, { readonly evaluateSubset: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  _scope: MutableReadScope,
  budget: EffectBudgetState,
  applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const evaluateSubset = effect.evaluateSubset;
  const evalCtx = mergeToEvalContext(env, cursor);
  const items = evalQuery(evaluateSubset.source, evalCtx);
  const subsetSize = resolveSubsetSize(evalValue(evaluateSubset.subsetSize, evalCtx));

  if (subsetSize < 0 || subsetSize > items.length) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.SUBSET_RUNTIME_VALIDATION_FAILED, 'evaluateSubset requires 0 <= subsetSize <= source item count', {
      effectType: 'evaluateSubset',
      subsetSize,
      sourceCount: items.length,
    });
  }

  const combinationCount = countCombinations(items.length, subsetSize);
  if (combinationCount > MAX_SUBSET_COMBINATIONS) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.SUBSET_RUNTIME_VALIDATION_FAILED, 'evaluateSubset combination count exceeds safety cap', {
      effectType: 'evaluateSubset',
      subsetSize,
      sourceCount: items.length,
      combinationCount,
      maxCombinations: MAX_SUBSET_COMBINATIONS,
    });
  }

  const traceSuffix = (env.collector.trace !== null || env.collector.conditionTrace !== null);

  let bestScore = Number.NEGATIVE_INFINITY;
  let bestSubset: readonly unknown[] | null = null;

  for (const subset of combinations(items, subsetSize)) {
    const computeCursor: EffectCursor = {
      ...cursor,
      bindings: {
        ...cursor.bindings,
        [evaluateSubset.subsetBind]: subset,
      },
      ...(traceSuffix ? { effectPath: `${cursor.effectPath ?? ''}.evaluateSubset.compute` } : {}),
    };

    const computeResult = applyBatch(evaluateSubset.compute, env, computeCursor, budget);
    if (computeResult.pendingChoice !== undefined) {
      return {
        state: computeResult.state,
        rng: computeResult.rng,
        ...(computeResult.emittedEvents === undefined ? {} : { emittedEvents: computeResult.emittedEvents }),
        bindings: cursor.bindings,
        pendingChoice: computeResult.pendingChoice,
      };
    }
    const scoreCursor: EffectCursor = {
      ...cursor,
      state: computeResult.state,
      rng: computeResult.rng,
      bindings: resolveEffectBindings(env, {
        ...cursor,
        state: computeResult.state,
        rng: computeResult.rng,
        bindings: computeResult.bindings ?? computeCursor.bindings,
      }),
    };
    const scoreCtx = mergeToReadContext(env, scoreCursor);
    const score = resolveScore(evalValue(evaluateSubset.scoreExpr, scoreCtx));

    if (score > bestScore) {
      bestScore = score;
      bestSubset = subset;
    }
  }

  if (bestSubset === null) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.SUBSET_RUNTIME_VALIDATION_FAILED, 'evaluateSubset could not evaluate any subset', {
      effectType: 'evaluateSubset',
      subsetSize,
      sourceCount: items.length,
    });
  }

  const exportedBindings: Record<string, unknown> = {
    ...cursor.bindings,
    [evaluateSubset.resultBind]: bestScore,
    ...(evaluateSubset.bestSubsetBind === undefined ? {} : { [evaluateSubset.bestSubsetBind]: bestSubset }),
  };

  const inCursor: EffectCursor = {
    ...cursor,
    bindings: exportedBindings,
    ...(traceSuffix ? { effectPath: `${cursor.effectPath ?? ''}.evaluateSubset.in` } : {}),
  };
  const inResult = applyBatch(evaluateSubset.in, env, inCursor, budget);
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
