import type { ConditionAST, ValueExpr } from './types.js';

export function extractBindingCountBounds(
  zoneFilter: ConditionAST,
  bindingName: string,
): { readonly min?: number; readonly max?: number } | null {
  const bounds = collect(zoneFilter, bindingName);
  return bounds === null || (bounds.min === undefined && bounds.max === undefined) ? null : bounds;
}

type Bounds = { min?: number; max?: number };
type CountComparison = { readonly op: '==' | '<=' | '<' | '>=' | '>'; readonly left: ValueExpr; readonly right: ValueExpr };

const collect = (condition: ConditionAST, bindingName: string): Bounds | null => {
  if (condition === true || condition === false || condition.op === 'or' || condition.op === 'not') return null;
  if (condition.op === 'and') return condition.args.reduce<Bounds | null>((all, arg) => merge(all, collect(arg, bindingName)), null);
  if (!isCountComparison(condition)) return null;
  return asBounds(condition.op, condition.left, condition.right, bindingName)
    ?? asBounds(flip(condition.op), condition.right, condition.left, bindingName);
};

const isCountComparison = (condition: ConditionAST): condition is CountComparison =>
  typeof condition === 'object'
  && (condition.op === '==' || condition.op === '<=' || condition.op === '<' || condition.op === '>=' || condition.op === '>');

const asBounds = (
  op: CountComparison['op'],
  left: ValueExpr,
  right: ValueExpr,
  bindingName: string,
): Bounds | null => {
  if (!isBindingCount(left, bindingName) || typeof right !== 'number') return null;
  switch (op) {
    case '==': return { min: right, max: right };
    case '<=': return { max: right };
    case '<': return { max: right - 1 };
    case '>=': return { min: right };
    case '>': return { min: right + 1 };
  }
};

const isBindingCount = (value: ValueExpr, bindingName: string): boolean =>
  typeof value === 'object'
  && value !== null
  && '_t' in value
  && value._t === 5
  && 'aggregate' in value
  && value.aggregate.op === 'count'
  && value.aggregate.query.query === 'binding'
  && value.aggregate.query.name === bindingName;

const flip = (op: CountComparison['op']): CountComparison['op'] =>
  op === '==' ? '==' : op === '<=' ? '>=' : op === '<' ? '>' : op === '>=' ? '<=' : '<';

const merge = (left: Bounds | null, right: Bounds | null): Bounds | null => {
  if (left === null || right === null) return left ?? right;
  return {
    ...(left.min === undefined && right.min === undefined ? {} : { min: Math.max(left.min ?? -Infinity, right.min ?? -Infinity) }),
    ...(left.max === undefined && right.max === undefined ? {} : { max: Math.min(left.max ?? Infinity, right.max ?? Infinity) }),
  };
};
