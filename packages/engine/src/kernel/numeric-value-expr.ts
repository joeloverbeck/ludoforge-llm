import type { NumericValueExpr, ValueExpr } from './types.js';

export function isNumericValueExpr(expr: ValueExpr): expr is NumericValueExpr {
  if (typeof expr === 'number') {
    return true;
  }
  if (typeof expr === 'boolean' || typeof expr === 'string') {
    return false;
  }
  if ('ref' in expr) {
    return true;
  }
  if ('concat' in expr) {
    return false;
  }
  if ('aggregate' in expr) {
    return true;
  }
  if ('if' in expr) {
    return isNumericValueExpr(expr.if.then) && isNumericValueExpr(expr.if.else);
  }
  return isNumericValueExpr(expr.left) && isNumericValueExpr(expr.right);
}
