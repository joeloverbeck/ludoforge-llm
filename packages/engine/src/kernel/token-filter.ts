import { matchesResolvedPredicate, type PredicateValue } from './query-predicate.js';
import type { FreeOperationExecutionOverlay } from './free-operation-overlay.js';
import type { Token, TokenFilterExpr, TokenFilterPredicate } from './types.js';
import { foldTokenFilterExpr } from './token-filter-expr-utils.js';
import { mapTokenFilterTraversalToTypeMismatch } from './token-filter-runtime-boundary.js';
import { resolveTokenViewFieldValue } from './token-view.js';

type TokenFilterScalar = string | number | boolean;

export type TokenFilterValueResolver = (value: TokenFilterPredicate['value']) => PredicateValue | null;

function isTokenFilterScalar(value: unknown): value is TokenFilterScalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function resolveLiteralTokenFilterValue(value: TokenFilterPredicate['value']): PredicateValue | null {
  if (Array.isArray(value)) {
    return value.every((item) => isTokenFilterScalar(item)) ? value : null;
  }
  if (isTokenFilterScalar(value)) {
    return value;
  }
  return null;
}

export function matchesTokenFilterPredicate(
  token: Token,
  predicate: TokenFilterPredicate,
  resolveValue: TokenFilterValueResolver = resolveLiteralTokenFilterValue,
  overlay?: FreeOperationExecutionOverlay,
): boolean {
  const value = resolveValue(predicate.value);
  if (value === null) {
    return false;
  }

  return matchesResolvedPredicate(
    resolveTokenViewFieldValue(token, predicate.prop, overlay),
    {
      field: predicate.prop,
      op: predicate.op,
      value,
    },
    {
      domain: 'token',
      predicate,
      tokenId: token.id,
    },
  );
}

export function matchesTokenFilterExpr(
  token: Token,
  expr: TokenFilterExpr,
  resolveValue: TokenFilterValueResolver = resolveLiteralTokenFilterValue,
  overlay?: FreeOperationExecutionOverlay,
): boolean {
  try {
    return foldTokenFilterExpr(expr, {
      predicate: (predicate) => matchesTokenFilterPredicate(token, predicate, resolveValue, overlay),
      not: (_entry, arg) => !arg,
      and: (_entry, args) => args.every(Boolean),
      or: (_entry, args) => args.some(Boolean),
    });
  } catch (error: unknown) {
    return mapTokenFilterTraversalToTypeMismatch(error);
  }
}

export function filterTokensByExpr(
  tokens: readonly Token[],
  expr: TokenFilterExpr,
  resolveValue: TokenFilterValueResolver = resolveLiteralTokenFilterValue,
  overlay?: FreeOperationExecutionOverlay,
): readonly Token[] {
  return tokens.filter((token) => matchesTokenFilterExpr(token, expr, resolveValue, overlay));
}
