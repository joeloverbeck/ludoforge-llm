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

export interface TokenFilterExprFoldHandlers<TResult> {
  readonly predicate: (predicate: TokenFilterPredicate) => TResult;
  readonly not: (expr: TokenFilterNotExpr, arg: TResult) => TResult;
  readonly and: (expr: TokenFilterBooleanExpr, args: readonly TResult[]) => TResult;
  readonly or: (expr: TokenFilterBooleanExpr, args: readonly TResult[]) => TResult;
}

export const isTokenFilterPredicateExpr = (expr: TokenFilterExpr): expr is TokenFilterPredicate => 'prop' in expr;

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
  if (expr.op === 'not') {
    return handlers.not(expr, foldTokenFilterExpr(expr.arg, handlers));
  }
  const foldedArgs = expr.args.map((entry) => foldTokenFilterExpr(entry, handlers));
  return expr.op === 'and'
    ? handlers.and(expr, foldedArgs)
    : handlers.or(expr, foldedArgs);
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
    if (entry.op === 'not') {
      walk(entry.arg, [...path, { kind: 'not' }]);
      return;
    }
    entry.args.forEach((arg, index) => {
      walk(arg, [...path, { kind: 'arg', index }]);
    });
  };
  walk(expr, []);
};
