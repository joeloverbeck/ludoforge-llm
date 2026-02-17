import type { EvalContext } from './eval-context.js';
import { evalCondition } from './eval-condition.js';
import { divisionByZeroError, typeMismatchError } from './eval-error.js';
import { evalQuery } from './eval-query.js';
import { resolveRef } from './resolve-ref.js';
import type { ValueExpr } from './types.js';

function isSafeIntegerNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(value);
}

function expectSafeInteger(value: unknown, message: string, context: Readonly<Record<string, unknown>>): number {
  if (!isSafeIntegerNumber(value)) {
    throw typeMismatchError(message, context);
  }

  return value;
}

export function evalValue(expr: ValueExpr, ctx: EvalContext): number | boolean | string {
  if (typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') {
    return expr;
  }

  if ('ref' in expr) {
    return resolveRef(expr, ctx);
  }

  if ('concat' in expr) {
    return expr.concat.map((child) => String(evalValue(child, ctx))).join('');
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

  const result = expr.op === '+' ? left + right : expr.op === '-' ? left - right : left * right;
  return expectSafeInteger(result, 'Arithmetic result must be a finite safe integer', { expr, left, right, result });
}
