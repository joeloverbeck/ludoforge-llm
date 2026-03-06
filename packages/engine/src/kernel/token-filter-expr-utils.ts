import type { TokenFilterExpr, TokenFilterPredicate } from './types.js';
import { typeMismatchError } from './eval-error.js';

export interface TokenFilterPathSegmentNot {
  readonly kind: 'not';
}

export interface TokenFilterPathSegmentArg {
  readonly kind: 'arg';
  readonly index: number;
}

export type TokenFilterPathSegment = TokenFilterPathSegmentNot | TokenFilterPathSegmentArg;

type TokenFilterBooleanExpr = Extract<TokenFilterExpr, { readonly op: 'and' | 'or' }>;
type TokenFilterNotExpr = Extract<TokenFilterExpr, { readonly op: 'not' }>;
type UnsupportedTokenFilterExprReason = 'unsupported_operator' | 'non_conforming_node';

export interface UnsupportedTokenFilterExprErrorContext {
  readonly expr: unknown;
  readonly op: unknown;
  readonly path: readonly TokenFilterPathSegment[];
  readonly reason: UnsupportedTokenFilterExprReason;
}

interface UnsupportedTokenFilterExprError {
  readonly code: 'TYPE_MISMATCH';
  readonly context?: UnsupportedTokenFilterExprErrorContext;
}

export interface TokenFilterExprFoldHandlers<TResult> {
  readonly predicate: (predicate: TokenFilterPredicate) => TResult;
  readonly not: (expr: TokenFilterNotExpr, arg: TResult) => TResult;
  readonly and: (expr: TokenFilterBooleanExpr, args: readonly TResult[]) => TResult;
  readonly or: (expr: TokenFilterBooleanExpr, args: readonly TResult[]) => TResult;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const readNodeOp = (node: unknown): unknown => (isRecord(node) ? Reflect.get(node, 'op') : undefined);

const isTokenFilterBooleanOperator = (op: unknown): op is 'and' | 'or' => op === 'and' || op === 'or';

const malformedTokenFilterExprError = (
  expr: unknown,
  path: readonly TokenFilterPathSegment[],
  reason: UnsupportedTokenFilterExprReason,
) => {
  const op = readNodeOp(expr);
  const message = reason === 'unsupported_operator'
    ? `Unsupported token filter operator "${String(op)}".`
    : `Malformed token filter expression node for operator "${String(op)}".`;
  return typeMismatchError(message, {
    expr,
    op,
    path,
    reason,
  } satisfies UnsupportedTokenFilterExprErrorContext);
};

export const isUnsupportedTokenFilterExprError = (
  error: unknown,
): error is UnsupportedTokenFilterExprError & { readonly context: UnsupportedTokenFilterExprErrorContext } => {
  if (!isRecord(error)) {
    return false;
  }
  if (error.code !== 'TYPE_MISMATCH') {
    return false;
  }
  if (!('context' in error) || !isRecord(error.context)) {
    return false;
  }
  const context = error.context;
  return (
    Array.isArray(context.path)
    && (context.reason === 'unsupported_operator' || context.reason === 'non_conforming_node')
  );
};

export const isTokenFilterPredicateExpr = (expr: unknown): expr is TokenFilterPredicate =>
  isRecord(expr) && 'prop' in expr;

const isTokenFilterNotExpr = (expr: unknown): expr is TokenFilterNotExpr =>
  isRecord(expr) && !isTokenFilterPredicateExpr(expr as TokenFilterExpr) && expr.op === 'not' && 'arg' in expr;

const isTokenFilterBooleanExpr = (expr: unknown): expr is TokenFilterBooleanExpr =>
  isRecord(expr)
  && !isTokenFilterPredicateExpr(expr as TokenFilterExpr)
  && isTokenFilterBooleanOperator(expr.op)
  && Array.isArray(expr.args);

export const tokenFilterPathSuffix = (path: readonly TokenFilterPathSegment[]): string =>
  path
    .map((segment) => (segment.kind === 'not' ? '.arg' : `.args[${segment.index}]`))
    .join('');

export const foldTokenFilterExpr = <TResult>(
  expr: TokenFilterExpr,
  handlers: TokenFilterExprFoldHandlers<TResult>,
): TResult => {
  if (isTokenFilterPredicateExpr(expr)) {
    return handlers.predicate(expr);
  }
  if (isTokenFilterNotExpr(expr)) {
    return handlers.not(expr, foldTokenFilterExpr(expr.arg, handlers));
  }
  if (isTokenFilterBooleanExpr(expr)) {
    const foldedArgs = expr.args.map((entry) => foldTokenFilterExpr(entry, handlers));
    return expr.op === 'and'
      ? handlers.and(expr, foldedArgs)
      : handlers.or(expr, foldedArgs);
  }
  if (isRecord(expr) && isTokenFilterBooleanOperator(readNodeOp(expr))) {
    throw malformedTokenFilterExprError(expr, [], 'non_conforming_node');
  }
  throw malformedTokenFilterExprError(expr, [], 'unsupported_operator');
};

export const walkTokenFilterExpr = (
  expr: TokenFilterExpr,
  visit: (entry: TokenFilterExpr, path: readonly TokenFilterPathSegment[]) => void,
): void => {
  const walk = (entry: unknown, path: readonly TokenFilterPathSegment[]): void => {
    if (isTokenFilterPredicateExpr(entry)) {
      visit(entry, path);
      return;
    }
    if (isTokenFilterNotExpr(entry)) {
      visit(entry, path);
      walk(entry.arg, [...path, { kind: 'not' }]);
      return;
    }
    if (isTokenFilterBooleanExpr(entry)) {
      visit(entry, path);
      entry.args.forEach((arg, index) => {
        walk(arg, [...path, { kind: 'arg', index }]);
      });
      return;
    }
    if (isRecord(entry) && isTokenFilterBooleanOperator(readNodeOp(entry))) {
      throw malformedTokenFilterExprError(entry, path, 'non_conforming_node');
    }
    throw malformedTokenFilterExprError(entry, path, 'unsupported_operator');
  };
  walk(expr, []);
};
