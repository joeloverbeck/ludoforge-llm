import type { TokenFilterExpr, TokenFilterPredicate } from './types.js';
import { booleanArityMessage, booleanAritySuggestion, isNonEmptyArray } from './boolean-arity-policy.js';
import { isPredicateOp } from '../contracts/index.js';

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
export type TokenFilterTraversalErrorReason = 'unsupported_operator' | 'non_conforming_node' | 'empty_args';

export interface TokenFilterTraversalErrorContext {
  readonly expr: unknown;
  readonly op: unknown;
  readonly path: readonly TokenFilterPathSegment[];
  readonly reason: TokenFilterTraversalErrorReason;
}

export interface TokenFilterTraversalError {
  readonly code: 'TOKEN_FILTER_TRAVERSAL_ERROR';
  readonly context: TokenFilterTraversalErrorContext;
  readonly message: string;
}

export interface NormalizedTokenFilterTraversalError {
  readonly reason: TokenFilterTraversalErrorReason;
  readonly op: unknown;
  readonly entryPathSuffix: string;
  readonly errorFieldSuffix: '.op' | '.args';
  readonly message: string;
  readonly suggestion: string;
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
const isTokenFilterPredicateOperator = (op: unknown): op is TokenFilterPredicate['op'] => isPredicateOp(op);

const tokenFilterTraversalErrorMessage = (reason: TokenFilterTraversalErrorReason, op: unknown): string => {
  if (reason === 'unsupported_operator') {
    return `Unsupported token filter operator "${String(op)}".`;
  }
  if (reason === 'empty_args') {
    return booleanArityMessage('tokenFilter', isTokenFilterBooleanOperator(op) ? op : 'and');
  }
  return `Malformed token filter expression node for operator "${String(op)}".`;
};

const tokenFilterTraversalErrorSuggestion = (reason: TokenFilterTraversalErrorReason): string => {
  if (reason === 'unsupported_operator') {
    return 'Use one of: and, or, not.';
  }
  if (reason === 'empty_args') {
    return booleanAritySuggestion('tokenFilter');
  }
  return 'Use a predicate leaf or a well-formed and/or/not expression node.';
};

const malformedTokenFilterExprError = (
  expr: unknown,
  path: readonly TokenFilterPathSegment[],
  reason: TokenFilterTraversalErrorReason,
): TokenFilterTraversalError => {
  const op = readNodeOp(expr);
  return {
    code: 'TOKEN_FILTER_TRAVERSAL_ERROR',
    message: tokenFilterTraversalErrorMessage(reason, op),
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
  message: tokenFilterTraversalErrorMessage('empty_args', op),
  context: {
    expr,
    op,
    path,
    reason: 'empty_args',
  },
});

export const normalizeTokenFilterTraversalError = (
  error: TokenFilterTraversalError,
): NormalizedTokenFilterTraversalError => {
  const reason = error.context.reason;
  const op = error.context.op;
  return {
    reason,
    op,
    entryPathSuffix: tokenFilterPathSuffix(error.context.path),
    errorFieldSuffix: reason === 'empty_args' ? '.args' : '.op',
    message: tokenFilterTraversalErrorMessage(reason, op),
    suggestion: tokenFilterTraversalErrorSuggestion(reason),
  };
};

export const isTokenFilterPredicateExpr = (expr: unknown): expr is TokenFilterPredicate =>
  isRecord(expr)
  && typeof expr.prop === 'string'
  && isTokenFilterPredicateOperator(expr.op)
  && 'value' in expr;

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
  const fold = (entry: unknown, path: readonly TokenFilterPathSegment[]): TResult => {
    if (isTokenFilterPredicateExpr(entry)) {
      return handlers.predicate(entry);
    }
    if (isTokenFilterNotExpr(entry)) {
      return handlers.not(entry, fold(entry.arg, [...path, { kind: 'not' }]));
    }
    if (isTokenFilterBooleanExpr(entry)) {
      if (!isNonEmptyArray(entry.args)) {
        throw tokenFilterBooleanArityError(entry, entry.op, path);
      }
      const foldedArgs = entry.args.map((arg, index) => fold(arg, [...path, { kind: 'arg', index }]));
      return entry.op === 'and'
        ? handlers.and(entry, foldedArgs)
        : handlers.or(entry, foldedArgs);
    }
    if (isRecord(entry) && isTokenFilterBooleanOperator(readNodeOp(entry))) {
      throw malformedTokenFilterExprError(entry, path, 'non_conforming_node');
    }
    throw malformedTokenFilterExprError(entry, path, 'unsupported_operator');
  };
  return fold(expr, []);
};

export const walkTokenFilterExpr = (
  expr: TokenFilterExpr,
  visit: (entry: TokenFilterExpr, path: readonly TokenFilterPathSegment[]) => void,
): void => {
  walkTokenFilterExprRecovering(expr, visit, (error) => {
    throw error;
  });
};

export const walkTokenFilterExprRecovering = (
  expr: TokenFilterExpr,
  visit: (entry: TokenFilterExpr, path: readonly TokenFilterPathSegment[]) => void,
  onTraversalError: (error: TokenFilterTraversalError) => void,
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
      if (!isNonEmptyArray(entry.args)) {
        onTraversalError(tokenFilterBooleanArityError(entry, entry.op, path));
        return;
      }
      visit(entry, path);
      entry.args.forEach((arg, index) => {
        walk(arg, [...path, { kind: 'arg', index }]);
      });
      return;
    }
    if (isRecord(entry) && isTokenFilterBooleanOperator(readNodeOp(entry))) {
      onTraversalError(malformedTokenFilterExprError(entry, path, 'non_conforming_node'));
      return;
    }
    onTraversalError(malformedTokenFilterExprError(entry, path, 'unsupported_operator'));
  };
  walk(expr, []);
};
