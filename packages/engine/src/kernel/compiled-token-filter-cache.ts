import { tryCompileTokenFilter, type CompiledTokenFilterFn } from './token-filter-compiler.js';
import type { TokenFilterExpr } from './types.js';

const compiledTokenFilterCache = new WeakMap<TokenFilterExpr, CompiledTokenFilterFn | null>();

export const getCompiledTokenFilter = (
  expr: TokenFilterExpr,
): CompiledTokenFilterFn | null => {
  if (compiledTokenFilterCache.has(expr)) {
    return compiledTokenFilterCache.get(expr) ?? null;
  }
  const compiled = tryCompileTokenFilter(expr);
  compiledTokenFilterCache.set(expr, compiled);
  return compiled;
};
