/**
 * Canonical stringification of ValueExpr, NumericValueExpr, and ZoneRef
 * for tooltip display. Handles all 12 Reference types, arithmetic
 * expressions, and aggregate expressions.
 *
 * Extracted from tooltip-normalizer.ts / tooltip-normalizer-compound.ts
 * to eliminate duplication and provide complete ref-type coverage.
 */

import type { ValueExpr, NumericValueExpr, ZoneRef } from './types-ast.js';

export const stringifyZoneRef = (ref: ZoneRef): string =>
  typeof ref === 'string' ? ref : '<expr>';

export const stringifyValueExpr = (expr: ValueExpr): string => {
  if (typeof expr === 'number' || typeof expr === 'boolean') return String(expr);
  if (typeof expr === 'string') return expr;

  // Reference types (all 12)
  if ('ref' in expr) {
    switch (expr.ref) {
      case 'gvar': return expr.var;
      case 'pvar': return expr.var;
      case 'binding': return expr.displayName ?? expr.name;
      case 'globalMarkerState': return expr.marker;
      case 'markerState': return `${expr.marker} of ${expr.space}`;
      case 'zoneCount': return `pieces in ${expr.zone}`;
      case 'tokenProp': return `${expr.token}.${expr.prop}`;
      case 'assetField': return expr.field;
      case 'zoneProp': return `${expr.zone}.${expr.prop}`;
      case 'activePlayer': return 'activePlayer';
      case 'tokenZone': return `zone of ${expr.token}`;
      case 'zoneVar': return `${expr.var} of ${expr.zone}`;
      default: return '<ref>';
    }
  }

  // Arithmetic expression
  if ('op' in expr && 'left' in expr && 'right' in expr) {
    const left = stringifyValueExpr(expr.left);
    const right = stringifyValueExpr(expr.right);
    return `${left} ${expr.op} ${right}`;
  }

  // Aggregate expression
  if ('aggregate' in expr) {
    return `${expr.aggregate.op} of ...`;
  }

  // Concat expression
  if ('concat' in expr && Array.isArray(expr.concat)) {
    return (expr.concat as readonly ValueExpr[]).map(stringifyValueExpr).join(' + ');
  }

  // Conditional expression
  if ('if' in expr) {
    return `${stringifyValueExpr(expr.if.then)} or ${stringifyValueExpr(expr.if.else)}`;
  }

  return '<expr>';
};

export const stringifyNumericExpr = (expr: NumericValueExpr): string => {
  if (typeof expr === 'number') return String(expr);

  // Arithmetic expression (NumericValueExpr has its own op/left/right)
  if ('op' in expr && 'left' in expr && 'right' in expr) {
    const left = stringifyNumericExpr(expr.left);
    const right = stringifyNumericExpr(expr.right);
    return `${left} ${expr.op} ${right}`;
  }

  // Aggregate expression
  if ('aggregate' in expr) {
    return `${expr.aggregate.op} of ...`;
  }

  return stringifyValueExpr(expr as ValueExpr);
};
