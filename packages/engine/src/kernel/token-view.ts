import { matchesResolvedPredicate, type PredicateValue } from './query-predicate.js';
import type { FreeOperationExecutionOverlay } from './free-operation-overlay.js';
import type { Token, TokenFilterPredicate } from './types.js';
import { foldTokenFilterExpr } from './token-filter-expr-utils.js';
import { mapTokenFilterTraversalToTypeMismatch } from './token-filter-runtime-boundary.js';

export type TokenViewScalar = string | number | boolean;

function isTokenViewScalar(value: unknown): value is TokenViewScalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function resolveLiteralTokenFilterValue(value: TokenFilterPredicate['value']): PredicateValue | null {
  if (Array.isArray(value)) {
    return value.every((item) => isTokenViewScalar(item)) ? value : null;
  }
  if (isTokenViewScalar(value)) {
    return value;
  }
  return null;
}

export function resolveLiteralTokenFieldValue(token: Token, field: string): unknown {
  if (field === 'id') {
    return token.id;
  }
  return token.props[field];
}

function matchesTokenInterpretationPredicate(token: Token, predicate: TokenFilterPredicate): boolean {
  const value = resolveLiteralTokenFilterValue(predicate.value);
  if (value === null) {
    return false;
  }
  const fieldName = predicate.prop ?? (predicate.field?.kind === 'prop' ? predicate.field.prop : predicate.field?.kind);
  if (fieldName === undefined) {
    return false;
  }

  return matchesResolvedPredicate(
    resolveLiteralTokenFieldValue(token, fieldName),
    {
      field: fieldName,
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

function matchesTokenInterpretationWhen(token: Token, when: NonNullable<FreeOperationExecutionOverlay['tokenInterpretations']>[number]['when']): boolean {
  try {
    return foldTokenFilterExpr(when, {
      predicate: (predicate) => matchesTokenInterpretationPredicate(token, predicate),
      not: (_entry, arg) => !arg,
      and: (_entry, args) => args.every(Boolean),
      or: (_entry, args) => args.some(Boolean),
    });
  } catch (error: unknown) {
    return mapTokenFilterTraversalToTypeMismatch(error);
  }
}

export function resolveTokenView(token: Token, overlay?: FreeOperationExecutionOverlay): Token {
  const interpretations = overlay?.tokenInterpretations;
  if (interpretations === undefined || interpretations.length === 0) {
    return token;
  }

  let nextProps: Record<string, TokenViewScalar> | null = null;
  for (const interpretation of interpretations) {
    if (!matchesTokenInterpretationWhen(token, interpretation.when)) {
      continue;
    }

    for (const [field, value] of Object.entries(interpretation.assign)) {
      if (!isTokenViewScalar(value)) {
        continue;
      }
      nextProps ??= { ...token.props };
      nextProps[field] = value;
    }
  }

  if (nextProps === null) {
    return token;
  }

  return {
    ...token,
    props: nextProps,
  };
}

export function resolveTokenViewFieldValue(
  token: Token,
  field: string,
  overlay?: FreeOperationExecutionOverlay,
): TokenViewScalar | undefined {
  const value = resolveLiteralTokenFieldValue(resolveTokenView(token, overlay), field);
  return isTokenViewScalar(value) ? value : undefined;
}
