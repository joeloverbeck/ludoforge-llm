import type { TokenFilterExpr } from '../../src/kernel/types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isTokenFilterExprNode = (value: unknown): value is TokenFilterExpr => {
  if (!isRecord(value)) {
    return false;
  }
  if (
    'value' in value
    && 'op' in value
    && (typeof value.prop === 'string' || isRecord(value.field))
  ) {
    return true;
  }
  if ('op' in value && value.op === 'not' && 'arg' in value) {
    return isTokenFilterExprNode(value.arg);
  }
  return (
    'op' in value
    && (value.op === 'and' || value.op === 'or')
    && Array.isArray(value.args)
    && value.args.every((entry) => isTokenFilterExprNode(entry))
  );
};

export const collectTokenFilterExprs = (root: unknown): readonly TokenFilterExpr[] => {
  const tokenFilters: TokenFilterExpr[] = [];
  const seen = new Set<unknown>();

  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || seen.has(value)) {
      return;
    }
    seen.add(value);

    if (isTokenFilterExprNode(value)) {
      tokenFilters.push(value);
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry);
      }
      return;
    }

    for (const entry of Object.values(value)) {
      visit(entry);
    }
  };

  visit(root);
  return tokenFilters;
};
