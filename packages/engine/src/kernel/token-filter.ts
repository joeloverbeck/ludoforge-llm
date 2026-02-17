import { matchesResolvedPredicate, type PredicateValue } from './query-predicate.js';
import type { Token, TokenFilterPredicate } from './types.js';

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

export function matchesAllTokenFilterPredicates(
  token: Token,
  predicates: readonly TokenFilterPredicate[],
  resolveValue: TokenFilterValueResolver = resolveLiteralTokenFilterValue,
): boolean {
  return predicates.every((predicate) => matchesTokenFilterPredicate(token, predicate, resolveValue));
}

export function filterTokensByPredicates(
  tokens: readonly Token[],
  predicates: readonly TokenFilterPredicate[],
  resolveValue: TokenFilterValueResolver = resolveLiteralTokenFilterValue,
): readonly Token[] {
  if (predicates.length === 0) {
    return [...tokens];
  }
  return tokens.filter((token) => matchesAllTokenFilterPredicates(token, predicates, resolveValue));
}
