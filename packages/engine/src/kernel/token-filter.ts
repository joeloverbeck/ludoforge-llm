import { matchesResolvedPredicate, type PredicateValue } from './query-predicate.js';
import type { FreeOperationExecutionOverlay } from './free-operation-overlay.js';
import type { Token, TokenFilterExpr, TokenFilterPredicate } from './types.js';
import { foldTokenFilterExpr } from './token-filter-expr-utils.js';
import { mapTokenFilterTraversalToTypeMismatch } from './token-filter-runtime-boundary.js';
import { resolveTokenViewFieldValue } from './token-view.js';

type TokenFilterScalar = string | number | boolean;

export type TokenFilterValueResolver = (value: TokenFilterPredicate['value']) => PredicateValue | null;
export type TokenFilterFieldResolver = (
  token: Token,
  predicate: TokenFilterPredicate,
  overlay?: FreeOperationExecutionOverlay,
) => unknown;

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

const resolveTokenFilterFieldName = (predicate: TokenFilterPredicate): string =>
  predicate.prop
  ?? (
    predicate.field?.kind === 'prop' || predicate.field?.kind === 'zoneProp'
      ? predicate.field.prop
      : predicate.field?.kind ?? 'unknown'
  );

const resolveTokenFilterFieldValue = (
  token: Token,
  predicate: TokenFilterPredicate,
  overlay?: FreeOperationExecutionOverlay,
  resolveField?: TokenFilterFieldResolver,
): unknown => {
  if (predicate.field?.kind === 'tokenId') {
    return token.id;
  }
  if (predicate.field?.kind === 'tokenZone') {
    return resolveField?.(token, predicate, overlay);
  }
  if (predicate.field?.kind === 'zoneProp') {
    return resolveField?.(token, predicate, overlay);
  }
  return resolveTokenViewFieldValue(
    token,
    predicate.prop ?? predicate.field?.prop ?? '',
    overlay,
  );
};

export function matchesTokenFilterPredicate(
  token: Token,
  predicate: TokenFilterPredicate,
  resolveValue: TokenFilterValueResolver = resolveLiteralTokenFilterValue,
  overlay?: FreeOperationExecutionOverlay,
  resolveField?: TokenFilterFieldResolver,
): boolean {
  const value = resolveValue(predicate.value);
  if (value === null) {
    return false;
  }

  return matchesResolvedPredicate(
    resolveTokenFilterFieldValue(token, predicate, overlay, resolveField),
    {
      field: resolveTokenFilterFieldName(predicate),
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
  resolveField?: TokenFilterFieldResolver,
): boolean {
  try {
    return foldTokenFilterExpr(expr, {
      predicate: (predicate) => matchesTokenFilterPredicate(token, predicate, resolveValue, overlay, resolveField),
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
  resolveField?: TokenFilterFieldResolver,
): readonly Token[] {
  return tokens.filter((token) => matchesTokenFilterExpr(token, expr, resolveValue, overlay, resolveField));
}
