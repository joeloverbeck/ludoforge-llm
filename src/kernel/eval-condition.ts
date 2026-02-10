import type { EvalContext } from './eval-context.js';
import { typeMismatchError } from './eval-error.js';
import { evalValue } from './eval-value.js';
import type { ConditionAST, ValueExpr } from './types.js';

function isMembershipCollection(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function evalMembershipSet(setExpr: ValueExpr, ctx: EvalContext, cond: ConditionAST): readonly unknown[] {
  if (typeof setExpr === 'object' && setExpr !== null && 'ref' in setExpr && setExpr.ref === 'binding') {
    const boundValue = ctx.bindings[setExpr.name];
    if (isMembershipCollection(boundValue)) {
      return boundValue;
    }
  }

  const setValue = evalValue(setExpr, ctx);
  if (isMembershipCollection(setValue)) {
    return setValue;
  }

  throw typeMismatchError('Condition "in" requires an array-like set value', {
    cond,
    setExpr,
    actualType: typeof setValue,
    value: setValue,
  });
}

function expectOrderingNumber(
  value: number | boolean | string,
  side: 'left' | 'right',
  cond: ConditionAST,
): number {
  if (typeof value !== 'number') {
    throw typeMismatchError('Ordering comparisons require numeric operands', {
      cond,
      side,
      actualType: typeof value,
      value,
    });
  }

  return value;
}

export function evalCondition(cond: ConditionAST, ctx: EvalContext): boolean {
  switch (cond.op) {
    case 'and':
      for (const arg of cond.args) {
        if (!evalCondition(arg, ctx)) {
          return false;
        }
      }
      return true;

    case 'or':
      for (const arg of cond.args) {
        if (evalCondition(arg, ctx)) {
          return true;
        }
      }
      return false;

    case 'not':
      return !evalCondition(cond.arg, ctx);

    case '==':
      return evalValue(cond.left, ctx) === evalValue(cond.right, ctx);

    case '!=':
      return evalValue(cond.left, ctx) !== evalValue(cond.right, ctx);

    case '<': {
      const left = expectOrderingNumber(evalValue(cond.left, ctx), 'left', cond);
      const right = expectOrderingNumber(evalValue(cond.right, ctx), 'right', cond);
      return left < right;
    }

    case '<=': {
      const left = expectOrderingNumber(evalValue(cond.left, ctx), 'left', cond);
      const right = expectOrderingNumber(evalValue(cond.right, ctx), 'right', cond);
      return left <= right;
    }

    case '>': {
      const left = expectOrderingNumber(evalValue(cond.left, ctx), 'left', cond);
      const right = expectOrderingNumber(evalValue(cond.right, ctx), 'right', cond);
      return left > right;
    }

    case '>=': {
      const left = expectOrderingNumber(evalValue(cond.left, ctx), 'left', cond);
      const right = expectOrderingNumber(evalValue(cond.right, ctx), 'right', cond);
      return left >= right;
    }

    case 'in': {
      const item = evalValue(cond.item, ctx);
      const setValues = evalMembershipSet(cond.set, ctx, cond);
      return setValues.includes(item);
    }

    default: {
      const _exhaustive: never = cond;
      return _exhaustive;
    }
  }
}
