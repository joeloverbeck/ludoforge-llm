import {
  createCompiledQueryPlanCache,
  getCompiledQueryPlan,
  type CompiledQueryPlanCache,
} from './compiled-query-plan.js';
import type { CompiledTokenFilterFn } from './token-filter-compiler.js';
import type { TokenFilterExpr } from './types.js';

const compiledTokenFilterCache = createCompiledQueryPlanCache();

export const getCompiledTokenFilter = (
  expr: TokenFilterExpr,
  cache: CompiledQueryPlanCache = compiledTokenFilterCache,
): CompiledTokenFilterFn | null => {
  return getCompiledQueryPlan(cache, expr);
};
