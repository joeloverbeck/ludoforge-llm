import type { ScopedVarNameExpr } from './types.js';

export interface ScopedVarNameRuntimeContext {
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly freeOperationOverlay?: {
    readonly grantContext?: Readonly<Record<string, unknown>>;
  };
}

export const isDynamicScopedVarNameExpr = (expr: ScopedVarNameExpr): expr is Exclude<ScopedVarNameExpr, string> =>
  typeof expr !== 'string';

export const tryStaticScopedVarNameExpr = (expr: ScopedVarNameExpr): string | null =>
  typeof expr === 'string' ? expr : null;

export const resolveScopedVarNameExprValue = (
  expr: ScopedVarNameExpr,
  ctx: ScopedVarNameRuntimeContext,
): unknown => {
  if (typeof expr === 'string') {
    return expr;
  }
  if (expr.ref === 'binding') {
    return ctx.bindings[expr.name];
  }
  return ctx.freeOperationOverlay?.grantContext?.[expr.key];
};
