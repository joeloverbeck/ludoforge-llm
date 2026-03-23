/**
 * Adds `_t` discriminant tags to ValueExpr objects embedded in ConditionAST.
 *
 * Marker lattice constraints arrive from YAML data-asset parsing as plain
 * objects without `_t` tags.  The kernel's `evalValue` dispatches on `_t`,
 * so every non-primitive ValueExpr must carry the tag before evaluation.
 *
 * This module provides a recursive tagger that walks a ConditionAST and
 * returns a structurally identical tree with `_t` tags injected wherever
 * a ValueExpr is detected by structural shape (ref, scalarArray, concat,
 * aggregate, if, or arithmetic op).
 */

import type { ConditionAST, ValueExpr, NumericValueExpr } from './types-ast.js';
import type { SpaceMarkerConstraintDef, SpaceMarkerLatticeDef } from './types-core.js';
import { VALUE_EXPR_TAG } from './types-ast.js';

const ARITHMETIC_OPS = new Set(['+', '-', '*', '/', 'floorDiv', 'ceilDiv', 'min', 'max']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Tag a single ValueExpr (or NumericValueExpr) that may lack `_t`.
 * Primitives pass through unchanged.
 */
export function tagValueExpr(expr: ValueExpr): ValueExpr {
  if (typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') {
    return expr;
  }
  // Already tagged — recurse children only
  if ('_t' in expr && typeof (expr as { readonly _t: unknown })._t === 'number') {
    return tagValueExprChildren(expr);
  }
  // Detect by structural shape
  if ('scalarArray' in expr) {
    return { _t: VALUE_EXPR_TAG.SCALAR_ARRAY, ...(expr as Record<string, unknown>) } as unknown as ValueExpr;
  }
  if ('ref' in expr) {
    return { _t: VALUE_EXPR_TAG.REF, ...(expr as Record<string, unknown>) } as unknown as ValueExpr;
  }
  if ('concat' in expr) {
    const concatExpr = expr as unknown as { readonly concat: readonly ValueExpr[] };
    return { _t: VALUE_EXPR_TAG.CONCAT, concat: concatExpr.concat.map(tagValueExpr) } as ValueExpr;
  }
  if ('if' in expr) {
    const ifExpr = expr as unknown as { readonly if: { readonly when: ConditionAST; readonly then: ValueExpr; readonly else: ValueExpr } };
    return {
      _t: VALUE_EXPR_TAG.IF,
      if: {
        when: tagConditionValueExprs(ifExpr.if.when),
        then: tagValueExpr(ifExpr.if.then),
        else: tagValueExpr(ifExpr.if.else),
      },
    } as ValueExpr;
  }
  if ('aggregate' in expr) {
    return { _t: VALUE_EXPR_TAG.AGGREGATE, ...(expr as Record<string, unknown>) } as unknown as ValueExpr;
  }
  if ('op' in expr && ARITHMETIC_OPS.has((expr as { readonly op: string }).op) && 'left' in expr && 'right' in expr) {
    const opExpr = expr as unknown as { readonly op: string; readonly left: ValueExpr; readonly right: ValueExpr };
    return {
      _t: VALUE_EXPR_TAG.OP,
      op: opExpr.op,
      left: tagValueExpr(opExpr.left),
      right: tagValueExpr(opExpr.right),
    } as ValueExpr;
  }
  return expr;
}

/**
 * Recurse into children of an already-tagged ValueExpr.
 */
function tagValueExprChildren(expr: ValueExpr): ValueExpr {
  if (typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') {
    return expr;
  }
  const tagged = expr as { readonly _t: number };
  switch (tagged._t) {
    case VALUE_EXPR_TAG.CONCAT: {
      const concatExpr = expr as Extract<ValueExpr, { readonly _t: 3 }>;
      return { _t: VALUE_EXPR_TAG.CONCAT, concat: concatExpr.concat.map(tagValueExpr) } as ValueExpr;
    }
    case VALUE_EXPR_TAG.IF: {
      const ifExpr = expr as Extract<ValueExpr, { readonly _t: 4 }>;
      return {
        _t: VALUE_EXPR_TAG.IF,
        if: {
          when: tagConditionValueExprs(ifExpr.if.when),
          then: tagValueExpr(ifExpr.if.then),
          else: tagValueExpr(ifExpr.if.else),
        },
      } as ValueExpr;
    }
    case VALUE_EXPR_TAG.OP: {
      const opExpr = expr as Extract<ValueExpr, { readonly _t: 6 }>;
      return {
        _t: VALUE_EXPR_TAG.OP,
        op: opExpr.op,
        left: tagValueExpr(opExpr.left),
        right: tagValueExpr(opExpr.right),
      } as ValueExpr;
    }
    default:
      return expr;
  }
}

/**
 * Tag a NumericValueExpr (reuses tagValueExpr since shapes are a subset).
 */
function tagNumericValueExpr(expr: NumericValueExpr): NumericValueExpr {
  return tagValueExpr(expr as ValueExpr) as NumericValueExpr;
}

/**
 * Recursively walk a ConditionAST and tag all embedded ValueExpr objects.
 */
export function tagConditionValueExprs(cond: ConditionAST): ConditionAST {
  if (typeof cond === 'boolean') {
    return cond;
  }
  if (!isRecord(cond)) {
    return cond;
  }
  const op = (cond as { readonly op: string }).op;
  switch (op) {
    case 'and': {
      const andCond = cond as Extract<ConditionAST, { readonly op: 'and' }>;
      return { op: 'and', args: andCond.args.map(tagConditionValueExprs) as unknown as typeof andCond.args };
    }
    case 'or': {
      const orCond = cond as Extract<ConditionAST, { readonly op: 'or' }>;
      return { op: 'or', args: orCond.args.map(tagConditionValueExprs) as unknown as typeof orCond.args };
    }
    case 'not': {
      const notCond = cond as Extract<ConditionAST, { readonly op: 'not' }>;
      return { op: 'not', arg: tagConditionValueExprs(notCond.arg) };
    }
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=': {
      const cmpCond = cond as { readonly op: string; readonly left: ValueExpr; readonly right: ValueExpr };
      return { op, left: tagValueExpr(cmpCond.left), right: tagValueExpr(cmpCond.right) } as ConditionAST;
    }
    case 'in': {
      const inCond = cond as { readonly op: 'in'; readonly item: ValueExpr; readonly set: ValueExpr };
      return { op: 'in', item: tagValueExpr(inCond.item), set: tagValueExpr(inCond.set) } as ConditionAST;
    }
    case 'zonePropIncludes': {
      const zpCond = cond as { readonly op: 'zonePropIncludes'; readonly zone: unknown; readonly prop: string; readonly value: ValueExpr };
      return { ...zpCond, value: tagValueExpr(zpCond.value) } as ConditionAST;
    }
    case 'markerStateAllowed': {
      const msCond = cond as { readonly op: 'markerStateAllowed'; readonly space: unknown; readonly marker: string; readonly state: ValueExpr };
      return { ...msCond, state: tagValueExpr(msCond.state) } as ConditionAST;
    }
    case 'markerShiftAllowed': {
      const mshCond = cond as { readonly op: 'markerShiftAllowed'; readonly space: unknown; readonly marker: string; readonly delta: NumericValueExpr };
      return { ...mshCond, delta: tagNumericValueExpr(mshCond.delta) } as ConditionAST;
    }
    case 'connected': {
      const connCond = cond as Extract<ConditionAST, { readonly op: 'connected' }>;
      if (connCond.via === undefined) return cond;
      return { ...connCond, via: tagConditionValueExprs(connCond.via) } as ConditionAST;
    }
    default:
      // 'adjacent' and any other ops that don't embed ValueExpr
      return cond;
  }
}

/**
 * Tag all ValueExpr objects inside marker lattice constraint conditions.
 * Returns a new array with tagged constraints.
 */
export function tagMarkerLatticeConstraints(
  lattices: readonly SpaceMarkerLatticeDef[],
): readonly SpaceMarkerLatticeDef[] {
  return lattices.map((lattice) => {
    if (lattice.constraints === undefined || lattice.constraints.length === 0) {
      return lattice;
    }
    return {
      ...lattice,
      constraints: lattice.constraints.map((constraint: SpaceMarkerConstraintDef) => ({
        ...constraint,
        when: tagConditionValueExprs(constraint.when),
      })),
    };
  });
}
