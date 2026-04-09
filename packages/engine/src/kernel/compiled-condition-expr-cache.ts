import { tryCompileCondition, type CompiledConditionPredicate } from './condition-compiler.js';
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
