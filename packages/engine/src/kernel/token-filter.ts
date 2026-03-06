import { matchesResolvedPredicate, type PredicateValue } from './query-predicate.js';
import { typeMismatchError } from './eval-error.js';
import type { Token, TokenFilterExpr, TokenFilterPredicate } from './types.js';
import { foldTokenFilterExpr } from './token-filter-expr-utils.js';

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
  return foldTokenFilterExpr(expr, {
    predicate: (predicate) => matchesTokenFilterPredicate(token, predicate, resolveValue),
    not: (_entry, arg) => !arg,
    and: (entry, args) => {
      if (entry.args.length === 0) {
        throw typeMismatchError('Token filter operator "and" requires at least one expression argument.', { expr });
      }
      return args.every(Boolean);
    },
    or: (entry, args) => {
      if (entry.args.length === 0) {
        throw typeMismatchError('Token filter operator "or" requires at least one expression argument.', { expr });
      }
      return args.some(Boolean);
    },
  });
}

export function filterTokensByExpr(
  tokens: readonly Token[],
  expr: TokenFilterExpr,
  resolveValue: TokenFilterValueResolver = resolveLiteralTokenFilterValue,
): readonly Token[] {
  return tokens.filter((token) => matchesTokenFilterExpr(token, expr, resolveValue));
}
