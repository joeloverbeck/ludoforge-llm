import { tryCompileCondition, type CompiledConditionPredicate } from './condition-compiler.js';
import type { ReadContext } from './eval-context.js';
import type { EnumerationStateSnapshot } from './enumeration-snapshot.js';
import { evalCondition } from './eval-condition.js';
import type { ConditionAST } from './types.js';

type CompiledConditionAst = Exclude<ConditionAST, boolean>;

const compiledConditionExprCache = new WeakMap<CompiledConditionAst, CompiledConditionPredicate | null>();

export const getCompiledCondition = (
  condition: CompiledConditionAst,
): CompiledConditionPredicate | null => {
  if (compiledConditionExprCache.has(condition)) {
    return compiledConditionExprCache.get(condition) ?? null;
  }

  const compiled = tryCompileCondition(condition);
  compiledConditionExprCache.set(condition, compiled);
  return compiled;
};

export const evaluateConditionWithCache = (
  condition: ConditionAST,
  ctx: ReadContext,
  snapshot?: EnumerationStateSnapshot,
): boolean => {
  if (typeof condition === 'boolean') {
    return condition;
  }

  const compiled = getCompiledCondition(condition);
  return compiled !== null ? compiled(ctx, snapshot) : evalCondition(condition, ctx);
};
