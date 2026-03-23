import { VALUE_EXPR_TAG } from './types.js';
import type { NumericValueExpr, ValueExpr, ValueExprTag } from './types.js';

export function isNumericValueExpr(expr: ValueExpr): expr is NumericValueExpr {
  if (typeof expr === 'number') {
    return true;
  }
  if (typeof expr === 'boolean' || typeof expr === 'string') {
    return false;
  }
  switch ((expr as { readonly _t: ValueExprTag })._t) {
    case VALUE_EXPR_TAG.SCALAR_ARRAY: return false;
    case VALUE_EXPR_TAG.CONCAT: return false;
    case VALUE_EXPR_TAG.REF: return true;
    case VALUE_EXPR_TAG.AGGREGATE: return true;
    case VALUE_EXPR_TAG.IF:
      return isNumericValueExpr((expr as Extract<ValueExpr, { readonly _t: 4 }>).if.then)
        && isNumericValueExpr((expr as Extract<ValueExpr, { readonly _t: 4 }>).if.else);
    case VALUE_EXPR_TAG.OP:
      return isNumericValueExpr((expr as Extract<ValueExpr, { readonly _t: 6 }>).left)
        && isNumericValueExpr((expr as Extract<ValueExpr, { readonly _t: 6 }>).right);
    default:
      throw new Error(`Unknown ValueExpr tag: ${(expr as { readonly _t: number })._t}`);
  }
}
