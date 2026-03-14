import type { ReadContext } from './eval-context.js';
import { evalCondition } from './eval-condition.js';
import { divisionByZeroError, typeMismatchError } from './eval-error.js';
import { evalQuery } from './eval-query.js';
import { resolveRef } from './resolve-ref.js';
import type { ScalarArrayValue, ScalarValue, ValueExpr } from './types.js';

function isSafeIntegerNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(value);
}

function expectSafeInteger(value: unknown, message: string, context: Readonly<Record<string, unknown>>): number {
  if (!isSafeIntegerNumber(value)) {
    throw typeMismatchError(message, context);
  }

  return value;
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
    const parts = expr.concat.map((child) => evalValue(child, ctx));
    const arrayParts = parts.filter(Array.isArray);
    if (arrayParts.length === 0) {
      return parts.map((part) => String(part)).join('');
    }
    if (arrayParts.length !== parts.length) {
      throw typeMismatchError('concat expressions must not mix scalar and scalar-array parts', {
        expr,
        parts,
      });
    }
    return parts.flatMap((part) => part);
  }

  if ('if' in expr) {
    const condResult = evalCondition(expr.if.when, ctx);
    return condResult ? evalValue(expr.if.then, ctx) : evalValue(expr.if.else, ctx);
  }

  if ('aggregate' in expr) {
    const { aggregate } = expr;
    const items = evalQuery(aggregate.query, ctx);

    if (aggregate.op === 'count') {
      return items.length;
    }

    if (items.length === 0) {
      return 0;
    }

    const values = items.map((item, index) => {
      const value = evalValue(aggregate.valueExpr, {
        ...ctx,
        bindings: {
          ...ctx.bindings,
          [aggregate.bind]: item,
        },
      });
      return expectSafeInteger(value, 'Aggregate valueExpr must evaluate to a finite safe integer', {
        expr,
        index,
        bind: aggregate.bind,
        value,
      });
    });

    if (aggregate.op === 'sum') {
      const total = values.reduce((acc, value) => acc + value, 0);
      return expectSafeInteger(total, 'Aggregate sum result must be a finite safe integer', {
        expr,
        values,
      });
    }

    if (aggregate.op === 'min') {
      return Math.min(...values);
    }

    return Math.max(...values);
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
