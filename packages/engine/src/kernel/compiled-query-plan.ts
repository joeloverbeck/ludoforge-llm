import { tryCompileTokenFilter, type CompiledTokenFilterFn } from './token-filter-compiler.js';
import type { TokenFilterExpr } from './types.js';

export type CompiledQueryPlan = CompiledTokenFilterFn;
export type CompiledQueryPlanCache = WeakMap<TokenFilterExpr, CompiledQueryPlan | null>;

export const createCompiledQueryPlanCache = (): CompiledQueryPlanCache => new WeakMap();

export const compileQueryPlan = (expr: TokenFilterExpr): CompiledQueryPlan | null =>
  tryCompileTokenFilter(expr);

export const getCompiledQueryPlan = (
  cache: CompiledQueryPlanCache,
  expr: TokenFilterExpr,
): CompiledQueryPlan | null => {
  if (cache.has(expr)) {
    return cache.get(expr) ?? null;
  }
  const compiled = compileQueryPlan(expr);
  cache.set(expr, compiled);
  return compiled;
};
