import type { ReadContext } from './eval-context.js';
import { evalCondition } from './eval-condition.js';
import { divisionByZeroError, typeMismatchError } from './eval-error.js';
import { evalQuery } from './eval-query.js';
import { computeTierAdmissibility } from './prioritized-tier-legality.js';
import { resolveRef } from './resolve-ref.js';
import type { ScalarArrayValue, ScalarValue, Token, ValueExpr } from './types.js';

function isSafeIntegerNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(value);
}

function expectSafeInteger(value: unknown, message: string, context: Readonly<Record<string, unknown>>): number {
  if (!isSafeIntegerNumber(value)) {
    throw typeMismatchError(message, context);
  }

  return value;
}

function isTokenQueryResult(value: unknown): value is Token {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { id?: unknown }).id === 'string'
    && typeof (value as { props?: unknown }).props === 'object'
    && (value as { props?: unknown }).props !== null;
}

function countAggregateItems(
  aggregate: Extract<ValueExpr, { readonly aggregate: unknown }>['aggregate'],
  ctx: ReadContext,
): number {
  const query = aggregate.query;
  if (query.query !== 'prioritized') {
    return evalQuery(query, ctx).length;
  }

  if (query.qualifierKey === undefined) {
    return evalQuery(query, ctx).length;
  }
  const qualifierKey: string = query.qualifierKey;

  const prioritizedEntries = query.tiers.map((tier, tierIndex) =>
    evalQuery(tier, ctx).map((item, itemIndex) => {
      if (!isTokenQueryResult(item)) {
        throw typeMismatchError('Aggregate count on prioritized qualifierKey requires token results', {
          aggregate,
          tierIndex,
          itemIndex,
          item,
          qualifierKey,
        });
      }

      const qualifier = item.props[qualifierKey];
      if (
        qualifier !== undefined
        && typeof qualifier !== 'string'
        && typeof qualifier !== 'number'
        && typeof qualifier !== 'boolean'
      ) {
        throw typeMismatchError('Aggregate count prioritized qualifier must resolve to a scalar', {
          aggregate,
          tierIndex,
          itemIndex,
          qualifierKey,
          qualifier,
        });
      }

      return qualifier === undefined
        ? { value: item.id }
        : { value: item.id, qualifier };
    }),
  );

  return computeTierAdmissibility(prioritizedEntries, [], 'byQualifier').admissibleValues.length;
}

export function evalNumericValue(expr: ValueExpr, ctx: ReadContext, label?: string): number {
  const result = evalValue(expr, ctx);
  if (typeof result !== 'number') {
    throw typeMismatchError(`Expected numeric value${label ? ` for ${label}` : ''}, got ${typeof result}`, {
      expr,
      result,
      expectedType: 'number',
    });
  }
  return result;
}

export function evalStringValue(expr: ValueExpr, ctx: ReadContext, label?: string): string {
  const result = evalValue(expr, ctx);
  if (typeof result !== 'string') {
    throw typeMismatchError(`Expected string value${label ? ` for ${label}` : ''}, got ${typeof result}`, {
      expr,
      result,
      expectedType: 'string',
    });
  }
  return result;
}

export function evalBooleanValue(expr: ValueExpr, ctx: ReadContext, label?: string): boolean {
  const result = evalValue(expr, ctx);
  if (typeof result !== 'boolean') {
    throw typeMismatchError(
      `Expected boolean value${label ? ` for ${label}` : ''}, got ${typeof result}`,
      { expr, result, expectedType: 'boolean' },
    );
  }
  return result;
}

export function evalIntegerValue(expr: ValueExpr, ctx: ReadContext, label?: string): number {
  const result = evalValue(expr, ctx);
  if (typeof result !== 'number' || !Number.isSafeInteger(result)) {
    throw typeMismatchError(`Expected integer value${label ? ` for ${label}` : ''}, got ${result}`, {
      expr,
      result,
      expectedType: 'integer',
    });
  }
  return result;
}

export function evalValue(expr: ValueExpr, ctx: ReadContext): ScalarValue | ScalarArrayValue {
  if (typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') {
    return expr;
  }
  if ('scalarArray' in expr) {
    return expr.scalarArray;
  }

  if ('ref' in expr) {
    return resolveRef(expr, ctx);
  }

  if (!Array.isArray(expr) && 'concat' in expr) {
    const children = expr.concat;
    const len = children.length;
    let allScalar = true;
    let allArray = true;
    const parts: (ScalarValue | ScalarArrayValue)[] = new Array(len);
    for (let i = 0; i < len; i++) {
      const val = evalValue(children[i]!, ctx);
      parts[i] = val;
      if (Array.isArray(val)) allScalar = false;
      else allArray = false;
    }
    if (allScalar) {
      let result = '';
      for (let i = 0; i < len; i++) result += String(parts[i]);
      return result;
    }
    if (allArray) {
      return (parts as ScalarArrayValue[]).flatMap((part) => part);
    }
    throw typeMismatchError('concat expressions must not mix scalar and scalar-array parts', {
      expr,
      parts,
    });
  }

  if ('if' in expr) {
    const condResult = evalCondition(expr.if.when, ctx);
    return condResult ? evalValue(expr.if.then, ctx) : evalValue(expr.if.else, ctx);
  }

  if ('aggregate' in expr) {
    const { aggregate } = expr;

    if (aggregate.op === 'count') {
      return countAggregateItems(aggregate, ctx);
    }

    const items = evalQuery(aggregate.query, ctx);

    if (items.length === 0) {
      return 0;
    }

    // Inline aggregation to avoid intermediate values array + per-item context spreads.
    // Uses a single mutable bindings object updated per item (safe: evalValue is synchronous).
    const itemBindings = { ...ctx.bindings };
    const itemCtx = { ...ctx, bindings: itemBindings };
    const op = aggregate.op;
    let accumulator = op === 'min' ? Number.MAX_SAFE_INTEGER : op === 'max' ? Number.MIN_SAFE_INTEGER : 0;

    for (let index = 0; index < items.length; index++) {
      itemBindings[aggregate.bind] = items[index]!;
      const value = evalValue(aggregate.valueExpr, itemCtx);
      const intValue = expectSafeInteger(value, 'Aggregate valueExpr must evaluate to a finite safe integer', {
        expr,
        index,
        bind: aggregate.bind,
        value,
      });
      if (op === 'sum') accumulator += intValue;
      else if (op === 'min') { if (intValue < accumulator) accumulator = intValue; }
      else { if (intValue > accumulator) accumulator = intValue; }
    }

    if (op === 'sum') {
      return expectSafeInteger(accumulator, 'Aggregate sum result must be a finite safe integer', {
        expr,
      });
    }
    return accumulator;
  }

  if (!('op' in expr)) {
    return expr;
  }

  const left = expectSafeInteger(evalValue(expr.left, ctx), 'Arithmetic operands must be finite safe integers', {
    expr,
    side: 'left',
  });
  const right = expectSafeInteger(evalValue(expr.right, ctx), 'Arithmetic operands must be finite safe integers', {
    expr,
    side: 'right',
  });

  if (expr.op === '/') {
    if (right === 0) {
      throw divisionByZeroError('Division by zero', { expr, left, right });
    }
    const result = Math.trunc(left / right);
    return expectSafeInteger(result, 'Arithmetic result must be a finite safe integer', { expr, left, right, result });
  }

  if (expr.op === 'floorDiv') {
    if (right === 0) {
      throw divisionByZeroError('Division by zero', { expr, left, right });
    }
    const result = Math.floor(left / right);
    return expectSafeInteger(result, 'Arithmetic result must be a finite safe integer', { expr, left, right, result });
  }

  if (expr.op === 'ceilDiv') {
    if (right === 0) {
      throw divisionByZeroError('Division by zero', { expr, left, right });
    }
    const result = Math.ceil(left / right);
    return expectSafeInteger(result, 'Arithmetic result must be a finite safe integer', { expr, left, right, result });
  }

  if (expr.op === 'min') {
    const result = Math.min(left, right);
    return expectSafeInteger(result, 'Arithmetic result must be a finite safe integer', { expr, left, right, result });
  }

  if (expr.op === 'max') {
    const result = Math.max(left, right);
    return expectSafeInteger(result, 'Arithmetic result must be a finite safe integer', { expr, left, right, result });
  }

  const result = expr.op === '+' ? left + right : expr.op === '-' ? left - right : left * right;
  return expectSafeInteger(result, 'Arithmetic result must be a finite safe integer', { expr, left, right, result });
}
