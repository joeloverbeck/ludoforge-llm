import type { TokenFilterExpr, TokenFilterPredicate } from './types.js';

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
type TokenFilterTraversalErrorReason = 'unsupported_operator' | 'non_conforming_node' | 'empty_args';

export interface TokenFilterTraversalErrorContext {
  readonly expr: unknown;
  readonly op: unknown;
  readonly path: readonly TokenFilterPathSegment[];
  readonly reason: TokenFilterTraversalErrorReason;
}

interface TokenFilterTraversalError {
  readonly code: 'TOKEN_FILTER_TRAVERSAL_ERROR';
  readonly context: TokenFilterTraversalErrorContext;
  readonly message: string;
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
  reason: TokenFilterTraversalErrorReason,
): TokenFilterTraversalError => {
  const op = readNodeOp(expr);
  return {
    code: 'TOKEN_FILTER_TRAVERSAL_ERROR',
    message: reason === 'unsupported_operator'
    ? `Unsupported token filter operator "${String(op)}".`
    : `Malformed token filter expression node for operator "${String(op)}".`,
    context: {
      expr,
      op,
      path,
      reason,
    },
  };
};

export const isTokenFilterTraversalError = (
  error: unknown,
): error is TokenFilterTraversalError => {
  if (!isRecord(error)) {
    return false;
  }
  if (error.code !== 'TOKEN_FILTER_TRAVERSAL_ERROR') {
    return false;
  }
  if (typeof error.message !== 'string') {
    return false;
  }
  if (!isRecord(error.context)) {
    return false;
  }
  const context = error.context;
  return (
    Array.isArray(context.path)
    && (context.reason === 'unsupported_operator' || context.reason === 'non_conforming_node' || context.reason === 'empty_args')
  );
};

export const tokenFilterBooleanArityError = (
  expr: TokenFilterExpr,
  op: 'and' | 'or',
  path: readonly TokenFilterPathSegment[] = [],
): TokenFilterTraversalError => ({
  code: 'TOKEN_FILTER_TRAVERSAL_ERROR',
  message: `Token filter operator "${op}" requires at least one expression argument.`,
  context: {
    expr,
    op,
    path,
    reason: 'empty_args',
  },
});

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
