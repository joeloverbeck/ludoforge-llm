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

export interface TokenFilterExprFoldHandlers<TResult> {
  readonly predicate: (predicate: TokenFilterPredicate) => TResult;
  readonly not: (expr: TokenFilterNotExpr, arg: TResult) => TResult;
  readonly and: (expr: TokenFilterBooleanExpr, args: readonly TResult[]) => TResult;
  readonly or: (expr: TokenFilterBooleanExpr, args: readonly TResult[]) => TResult;
}

export const isTokenFilterPredicateExpr = (expr: TokenFilterExpr): expr is TokenFilterPredicate => 'prop' in expr;

const isTokenFilterNotExpr = (expr: TokenFilterExpr): expr is TokenFilterNotExpr =>
  !isTokenFilterPredicateExpr(expr) && expr.op === 'not';

const isTokenFilterBooleanExpr = (expr: TokenFilterExpr): expr is TokenFilterBooleanExpr =>
  !isTokenFilterPredicateExpr(expr) && (expr.op === 'and' || expr.op === 'or');

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
  const op = Reflect.get(expr as object, 'op');
  throw typeMismatchError(`Unsupported token filter operator "${String(op)}".`, { expr });
};

export const walkTokenFilterExpr = (
  expr: TokenFilterExpr,
  visit: (entry: TokenFilterExpr, path: readonly TokenFilterPathSegment[]) => void,
): void => {
  const walk = (entry: TokenFilterExpr, path: readonly TokenFilterPathSegment[]): void => {
    visit(entry, path);
    if (isTokenFilterPredicateExpr(entry)) {
      return;
    }
    if (isTokenFilterNotExpr(entry)) {
      walk(entry.arg, [...path, { kind: 'not' }]);
      return;
    }
    if (isTokenFilterBooleanExpr(entry)) {
      entry.args.forEach((arg, index) => {
        walk(arg, [...path, { kind: 'arg', index }]);
      });
    }
  };
  walk(expr, []);
};
