import type { ValueExpr, Reference } from '../kernel/types.js';
import { tryStaticScopedVarNameExpr } from '../kernel/scoped-var-name-resolution.js';

export type InferredType = 'number' | 'boolean' | 'string' | 'unknown';

export interface TypeInferenceContext {
  readonly globalVarTypes: Readonly<Record<string, 'int' | 'boolean'>>;
  readonly perPlayerVarTypes: Readonly<Record<string, 'int' | 'boolean'>>;
  readonly tokenPropTypes: Readonly<Record<string, Readonly<Record<string, 'int' | 'string' | 'boolean'>>>>;
  readonly tableFieldTypes: Readonly<Record<string, Readonly<Record<string, 'string' | 'int' | 'boolean'>>>>;
}

export function inferValueExprType(expr: ValueExpr, ctx: TypeInferenceContext): InferredType {
  if (typeof expr === 'number') {
    return 'number';
  }
  if (typeof expr === 'boolean') {
    return 'boolean';
  }
  if (typeof expr === 'string') {
    return 'string';
  }
  if ('scalarArray' in expr) {
    return 'unknown';
  }

  if ('ref' in expr) {
    return inferReferenceType(expr, ctx);
  }

  if ('op' in expr) {
    return 'number';
  }

  if ('aggregate' in expr) {
    return 'number';
  }

  if ('concat' in expr) {
    const childTypes = expr.concat.map((child) => inferValueExprType(child, ctx));
    return childTypes.every((childType) => childType === 'string' || childType === 'number' || childType === 'boolean')
      ? 'string'
      : 'unknown';
  }

  if ('if' in expr) {
    const thenType = inferValueExprType(expr.if.then, ctx);
    const elseType = inferValueExprType(expr.if.else, ctx);
    if (thenType === elseType) {
      return thenType;
    }
    if (thenType === 'unknown') {
      return elseType;
    }
    if (elseType === 'unknown') {
      return thenType;
    }
    return 'unknown';
  }

  return 'unknown';
}

function inferReferenceType(ref: Reference, ctx: TypeInferenceContext): InferredType {
  switch (ref.ref) {
    case 'gvar': {
      const variable = tryStaticScopedVarNameExpr(ref.var);
      const varType = variable === null ? undefined : ctx.globalVarTypes[variable];
      return varType === undefined ? 'unknown' : varDefTypeToInferred(varType);
    }
    case 'pvar': {
      const variable = tryStaticScopedVarNameExpr(ref.var);
      const varType = variable === null ? undefined : ctx.perPlayerVarTypes[variable];
      return varType === undefined ? 'unknown' : varDefTypeToInferred(varType);
    }
    case 'zoneCount':
      return 'number';
    case 'activePlayer':
      return 'number';
    case 'activeSeat':
      return 'string';
    case 'tokenProp': {
      const tokenTypes = Object.values(ctx.tokenPropTypes);
      const propTypes = tokenTypes
        .map((props) => props[ref.prop])
        .filter((t): t is 'int' | 'string' | 'boolean' => t !== undefined);
      if (propTypes.length === 0) {
        return 'unknown';
      }
      const first = propTypes[0]!;
      if (propTypes.every((t) => t === first)) {
        return varDefTypeToInferred(first);
      }
      return 'unknown';
    }
    case 'assetField': {
      const table = ctx.tableFieldTypes[ref.tableId];
      if (table === undefined) {
        return 'unknown';
      }
      const fieldType = table[ref.field];
      return fieldType === undefined ? 'unknown' : varDefTypeToInferred(fieldType);
    }
    case 'markerState':
    case 'globalMarkerState':
      return 'string';
    case 'tokenZone':
      return 'string';
    case 'zoneProp':
    case 'binding':
      return 'unknown';
    default:
      return 'unknown';
  }
}

function varDefTypeToInferred(defType: 'int' | 'string' | 'boolean'): InferredType {
  switch (defType) {
    case 'int':
      return 'number';
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
  }
}

export function areTypesCompatible(left: InferredType, right: InferredType): boolean {
  if (left === 'unknown' || right === 'unknown') {
    return true;
  }
  return left === right;
}
