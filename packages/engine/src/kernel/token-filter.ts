import { matchesResolvedPredicate, type PredicateValue } from './query-predicate.js';
import { isNonEmptyArray } from './boolean-arity-policy.js';
import type { Token, TokenFilterExpr, TokenFilterPredicate } from './types.js';
import { foldTokenFilterExpr, tokenFilterBooleanArityError } from './token-filter-expr-utils.js';
import { mapTokenFilterTraversalToTypeMismatch } from './token-filter-runtime-boundary.js';

type TokenFilterScalar = string | number | boolean;

export type TokenFilterValueResolver = (value: TokenFilterPredicate['value']) => PredicateValue | null;

function isTokenFilterScalar(value: unknown): value is TokenFilterScalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function tokenFilterFieldValue(token: Token, field: string): TokenFilterScalar | undefined {
  if (field === 'id') {
    return token.id;
  }
  const value = token.props[field];
  return isTokenFilterScalar(value) ? value : undefined;
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
): boolean {
  const value = resolveValue(predicate.value);
  if (value === null) {
    return false;
  }

  return matchesResolvedPredicate(
    tokenFilterFieldValue(token, predicate.prop),
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
): boolean {
  try {
    return foldTokenFilterExpr(expr, {
      predicate: (predicate) => matchesTokenFilterPredicate(token, predicate, resolveValue),
      not: (_entry, arg) => !arg,
      and: (entry, args) => {
        if (!isNonEmptyArray(entry.args)) {
          throw tokenFilterBooleanArityError(expr, 'and');
        }
        return args.every(Boolean);
      },
      or: (entry, args) => {
        if (!isNonEmptyArray(entry.args)) {
          throw tokenFilterBooleanArityError(expr, 'or');
        }
        return args.some(Boolean);
      },
    });
  } catch (error: unknown) {
    return mapTokenFilterTraversalToTypeMismatch(error);
  }
}

export function filterTokensByExpr(
  tokens: readonly Token[],
  expr: TokenFilterExpr,
  resolveValue: TokenFilterValueResolver = resolveLiteralTokenFilterValue,
): readonly Token[] {
  return tokens.filter((token) => matchesTokenFilterExpr(token, expr, resolveValue));
}
