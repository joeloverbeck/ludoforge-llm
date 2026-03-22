import { evalCondition, evalConditionTraced } from './eval-condition.js';
import { evalQuery } from './eval-query.js';
import { evalValue } from './eval-value.js';
import { rebaseIterationPath, withIterationSegment } from './decision-scope.js';
import { resolveControlFlowIterationLimit } from './control-flow-limit.js';
import { buildForEachTraceEntry, buildReduceTraceEntry } from './control-flow-trace.js';
import { effectRuntimeError } from './effect-error.js';
import { emitTrace, emitWarning } from './execution-collector.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import { resolveRuntimeTokenBindingValue } from './token-binding.js';
import { resolveTraceProvenance, withTracePath } from './trace-provenance.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST, TriggerEvent } from './types.js';

export interface EffectBudgetState {
  remaining: number;
  readonly max: number;
}

type ApplyEffectsWithBudget = (effects: readonly EffectAST[], ctx: EffectContext, budget: EffectBudgetState) => EffectResult;

/** Merge moveParams into bindings. Fast path: return bindings directly when moveParams is empty. */
const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => {
  const mp = ctx.moveParams;
  // Fast path: skip merge when moveParams has no keys (common in lifecycle effects).
  // Uses for-in to check emptiness without Object.keys() allocation.
  for (const key in mp) {
    void key;
    return { ...mp, ...ctx.bindings };
  }
  return ctx.bindings;
};

export const applyIf = (
  effect: Extract<EffectAST, { readonly if: unknown }>,
  ctx: EffectContext,
  budget: EffectBudgetState,
  applyEffectsWithBudget: ApplyEffectsWithBudget,
): EffectResult => {
  const resolvedBindings = resolveEffectBindings(ctx);
  // Skip context spread when bindings identity unchanged (common in lifecycle effects with empty moveParams)
  const evalCtx = resolvedBindings === ctx.bindings ? ctx : { ...ctx, bindings: resolvedBindings };
  // Skip trace provenance construction when condition tracing is disabled (saves ~131K object allocations)
  const predicate = ctx.collector.conditionTrace !== null
    ? evalConditionTraced(effect.if.when, evalCtx, 'ifBranch', resolveTraceProvenance(ctx))
    : evalCondition(effect.if.when, evalCtx);

  if (predicate) {
    const thenResult = applyEffectsWithBudget(effect.if.then, withTracePath(ctx, '.if.then'), budget);
    return {
      state: thenResult.state,
      rng: thenResult.rng,
      ...(thenResult.emittedEvents === undefined ? {} : { emittedEvents: thenResult.emittedEvents }),
      bindings: thenResult.bindings ?? ctx.bindings,
      ...(thenResult.decisionScope === undefined ? {} : { decisionScope: thenResult.decisionScope }),
      ...(thenResult.pendingChoice === undefined ? {} : { pendingChoice: thenResult.pendingChoice }),
    };
  }

  if (effect.if.else !== undefined) {
    const elseResult = applyEffectsWithBudget(effect.if.else, withTracePath(ctx, '.if.else'), budget);
    return {
      state: elseResult.state,
      rng: elseResult.rng,
      ...(elseResult.emittedEvents === undefined ? {} : { emittedEvents: elseResult.emittedEvents }),
      bindings: elseResult.bindings ?? ctx.bindings,
      ...(elseResult.decisionScope === undefined ? {} : { decisionScope: elseResult.decisionScope }),
      ...(elseResult.pendingChoice === undefined ? {} : { pendingChoice: elseResult.pendingChoice }),
    };
  }

  return { state: ctx.state, rng: ctx.rng, bindings: ctx.bindings, decisionScope: ctx.decisionScope };
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

  const nestedResult = applyEffectsWithBudget(effect.let.in, withTracePath(nestedCtx, '.let.in'), budget);
  if (nestedResult.pendingChoice !== undefined) {
    return {
      state: nestedResult.state,
      rng: nestedResult.rng,
      ...(nestedResult.emittedEvents === undefined ? {} : { emittedEvents: nestedResult.emittedEvents }),
      bindings: ctx.bindings,
      ...(nestedResult.decisionScope === undefined ? {} : { decisionScope: nestedResult.decisionScope }),
      pendingChoice: nestedResult.pendingChoice,
    };
  }
  const nestedBindings = nestedResult.bindings ?? nestedCtx.bindings;
  const exportedBindings: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(nestedBindings)) {
    if (name === effect.let.bind || !name.startsWith('$')) {
      continue;
    }
    exportedBindings[name] = value;
  }
  return {
    state: nestedResult.state,
    rng: nestedResult.rng,
    ...(nestedResult.emittedEvents === undefined ? {} : { emittedEvents: nestedResult.emittedEvents }),
    ...(nestedResult.decisionScope === undefined ? {} : { decisionScope: nestedResult.decisionScope }),
    bindings: {
      ...ctx.bindings,
      ...exportedBindings,
    },
  };
};

export const applyForEach = (
  effect: Extract<EffectAST, { readonly forEach: unknown }>,
  ctx: EffectContext,
  budget: EffectBudgetState,
  applyEffectsWithBudget: ApplyEffectsWithBudget,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const limit = resolveControlFlowIterationLimit('forEach', effect.forEach.limit, evalCtx, (evaluatedLimit) => {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CONTROL_FLOW_RUNTIME_VALIDATION_FAILED, 'forEach.limit must evaluate to a non-negative integer', {
      effectType: 'forEach',
      limit: evaluatedLimit,
    });
  });

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
  let currentDecisionScope = ctx.decisionScope;
  const parentIterationPath = ctx.decisionScope.iterationPath;
  const emittedEvents: TriggerEvent[] = [];
  for (let iterIdx = 0; iterIdx < boundedItems.length; iterIdx += 1) {
    const item = boundedItems[iterIdx]!;
    const iterationCtx: EffectContext = {
      ...ctx,
      state: currentState,
      rng: currentRng,
      decisionScope: withIterationSegment(rebaseIterationPath(currentDecisionScope, parentIterationPath), iterIdx),
      bindings: {
        ...ctx.bindings,
        [effect.forEach.bind]: item,
      },
    };
    const iterationResult = applyEffectsWithBudget(effect.forEach.effects, withTracePath(iterationCtx, '.forEach.effects'), budget);
    currentState = iterationResult.state;
    currentRng = iterationResult.rng;
    currentDecisionScope = iterationResult.decisionScope ?? currentDecisionScope;
    emittedEvents.push(...(iterationResult.emittedEvents ?? []));
    if (iterationResult.pendingChoice !== undefined) {
      return {
        state: currentState,
        rng: currentRng,
        emittedEvents,
        bindings: ctx.bindings,
        decisionScope: currentDecisionScope,
        pendingChoice: iterationResult.pendingChoice,
      };
    }
  }

  if (ctx.collector.trace !== null) {
    emitTrace(ctx.collector, buildForEachTraceEntry({
      bind: effect.forEach.bind,
      ...(effect.forEach.macroOrigin === undefined ? {} : { macroOrigin: effect.forEach.macroOrigin }),
      matchCount: queryResult.length,
      iteratedCount: boundedItems.length,
      explicitLimit: effect.forEach.limit !== undefined,
      resolvedLimit: limit,
      provenance: resolveTraceProvenance(ctx),
    }));
  }

  if (effect.forEach.countBind !== undefined && effect.forEach.in !== undefined) {
    const countCtx: EffectContext = {
      ...ctx,
      state: currentState,
      rng: currentRng,
      decisionScope: currentDecisionScope,
      bindings: {
        ...ctx.bindings,
        [effect.forEach.countBind]: boundedItems.length,
      },
    };
    const countResult = applyEffectsWithBudget(effect.forEach.in, withTracePath(countCtx, '.forEach.in'), budget);
    currentState = countResult.state;
    currentRng = countResult.rng;
    currentDecisionScope = countResult.decisionScope ?? currentDecisionScope;
    emittedEvents.push(...(countResult.emittedEvents ?? []));
    if (countResult.pendingChoice !== undefined) {
      return {
        state: currentState,
        rng: currentRng,
        emittedEvents,
        bindings: ctx.bindings,
        decisionScope: currentDecisionScope,
        pendingChoice: countResult.pendingChoice,
      };
    }
  }

  return {
    state: currentState,
    rng: currentRng,
    emittedEvents,
    bindings: ctx.bindings,
    decisionScope: currentDecisionScope,
  };
};

export const applyReduce = (
  effect: Extract<EffectAST, { readonly reduce: unknown }>,
  ctx: EffectContext,
  budget: EffectBudgetState,
  applyEffectsWithBudget: ApplyEffectsWithBudget,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const limit = resolveControlFlowIterationLimit('reduce', effect.reduce.limit, evalCtx, (evaluatedLimit) => {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CONTROL_FLOW_RUNTIME_VALIDATION_FAILED, 'reduce.limit must evaluate to a non-negative integer', {
      effectType: 'reduce',
      limit: evaluatedLimit,
    });
  });
  const queryResult = evalQuery(effect.reduce.over, evalCtx);
  const boundedItems = queryResult.slice(0, limit);

  let accumulator = evalValue(effect.reduce.initial, evalCtx);
  for (const item of boundedItems) {
    accumulator = evalValue(effect.reduce.next, {
      ...evalCtx,
      bindings: {
        ...evalCtx.bindings,
        [effect.reduce.itemBind]: item,
        [effect.reduce.accBind]: accumulator,
      },
    });
  }

  if (ctx.collector.trace !== null) {
    emitTrace(ctx.collector, buildReduceTraceEntry({
      itemBind: effect.reduce.itemBind,
      accBind: effect.reduce.accBind,
      resultBind: effect.reduce.resultBind,
      ...(effect.reduce.itemMacroOrigin === undefined ? {} : { itemMacroOrigin: effect.reduce.itemMacroOrigin }),
      ...(effect.reduce.accMacroOrigin === undefined ? {} : { accMacroOrigin: effect.reduce.accMacroOrigin }),
      ...(effect.reduce.resultMacroOrigin === undefined ? {} : { resultMacroOrigin: effect.reduce.resultMacroOrigin }),
      matchCount: queryResult.length,
      iteratedCount: boundedItems.length,
      explicitLimit: effect.reduce.limit !== undefined,
      resolvedLimit: limit,
      provenance: resolveTraceProvenance(ctx),
    }));
  }

  const continuationCtx: EffectContext = {
    ...ctx,
    bindings: {
      ...ctx.bindings,
      [effect.reduce.resultBind]: accumulator,
    },
  };
  const continuationResult = applyEffectsWithBudget(effect.reduce.in, withTracePath(continuationCtx, '.reduce.in'), budget);
  if (continuationResult.pendingChoice !== undefined) {
    return {
      state: continuationResult.state,
      rng: continuationResult.rng,
      ...(continuationResult.emittedEvents === undefined ? {} : { emittedEvents: continuationResult.emittedEvents }),
      bindings: ctx.bindings,
      ...(continuationResult.decisionScope === undefined ? {} : { decisionScope: continuationResult.decisionScope }),
      pendingChoice: continuationResult.pendingChoice,
    };
  }
  const continuationBindings = continuationResult.bindings ?? continuationCtx.bindings;
  const exportedBindings: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(continuationBindings)) {
    if (name === effect.reduce.resultBind || !name.startsWith('$')) {
      continue;
    }
    exportedBindings[name] = value;
  }
  return {
    state: continuationResult.state,
    rng: continuationResult.rng,
    ...(continuationResult.emittedEvents === undefined ? {} : { emittedEvents: continuationResult.emittedEvents }),
    ...(continuationResult.decisionScope === undefined ? {} : { decisionScope: continuationResult.decisionScope }),
    bindings: {
      ...ctx.bindings,
      ...exportedBindings,
    },
  };
};

const resolveRemovalBudget = (budgetExpr: unknown, effectType: string): number => {
  if (typeof budgetExpr !== 'number' || !Number.isSafeInteger(budgetExpr) || budgetExpr < 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CONTROL_FLOW_RUNTIME_VALIDATION_FAILED, `${effectType}.budget must evaluate to a non-negative integer`, {
      effectType,
      budget: budgetExpr,
    });
  }
  return budgetExpr;
};

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
  let currentDecisionScope = ctx.decisionScope;
  const emittedEvents: TriggerEvent[] = [];
  const countBindings: Record<string, number> = {};

  for (const [groupIndex, group] of effect.removeByPriority.groups.entries()) {
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
        if (resolveRuntimeTokenBindingValue(item) === null) {
          throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CONTROL_FLOW_RUNTIME_VALIDATION_FAILED, 'removeByPriority groups must resolve to token items', {
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
          decisionScope: currentDecisionScope,
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
          withTracePath(iterationCtx, `.removeByPriority.groups[${groupIndex}].effects`),
          budget,
        );

        currentState = moveResult.state;
        currentRng = moveResult.rng;
        currentDecisionScope = moveResult.decisionScope ?? currentDecisionScope;
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
        decisionScope: currentDecisionScope,
        bindings: exportedBindings,
      };

      const inResult = applyEffectsWithBudget(effect.removeByPriority.in, withTracePath(inCtx, '.removeByPriority.in'), budget);
      currentState = inResult.state;
      currentRng = inResult.rng;
      currentDecisionScope = inResult.decisionScope ?? currentDecisionScope;
      emittedEvents.push(...(inResult.emittedEvents ?? []));
      if (inResult.pendingChoice !== undefined) {
        return {
          state: currentState,
          rng: currentRng,
          emittedEvents,
          bindings: exportedBindings,
          decisionScope: currentDecisionScope,
          pendingChoice: inResult.pendingChoice,
        };
      }
    }

  return {
    state: currentState,
    rng: currentRng,
    emittedEvents,
    bindings: exportedBindings,
    decisionScope: currentDecisionScope,
  };
};
