import type { ConditionAST, NumericValueExpr, ValueExpr, ZoneSel } from './types.js';

export const CONDITION_OPERATORS = [
  'and',
  'or',
  'not',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'in',
  'adjacent',
  'connected',
  'zonePropIncludes',
  'markerStateAllowed',
  'markerShiftAllowed',
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

type ConditionNode = Exclude<ConditionAST, boolean>;
type ConditionNodeByOp<Op extends ConditionOperator> = ConditionNode extends infer Node
  ? Node extends { readonly op: infer NodeOp }
    ? Op extends NodeOp
      ? Node
      : never
    : never
  : never;

export interface ConditionFieldDescriptor<TCondition, TValue> {
  readonly name: Extract<keyof TCondition, string>;
  readonly get: (condition: TCondition) => TValue;
}

export interface ConditionOperatorMeta<Op extends ConditionOperator = ConditionOperator> {
  readonly op: Op;
  readonly category: 'boolean' | 'comparison' | 'spatial' | 'marker' | 'membership';
  readonly valueFields?: readonly ConditionFieldDescriptor<ConditionNodeByOp<Op>, ValueExpr>[];
  readonly numericValueFields?: readonly ConditionFieldDescriptor<ConditionNodeByOp<Op>, NumericValueExpr>[];
  readonly zoneSelectorFields?: readonly ConditionFieldDescriptor<ConditionNodeByOp<Op>, ZoneSel>[];
  readonly nestedConditionFields?: readonly ConditionFieldDescriptor<
    ConditionNodeByOp<Op>,
    ConditionAST | readonly ConditionAST[] | undefined
  >[];
}

const CONDITION_OPERATOR_SET: ReadonlySet<string> = new Set<string>(CONDITION_OPERATORS);

const defineConditionField = <TCondition, TName extends Extract<keyof TCondition, string>, TValue extends TCondition[TName]>(
  name: TName,
  get: (condition: TCondition) => TValue,
): ConditionFieldDescriptor<TCondition, TValue> => ({ name, get });

const defineConditionOperatorMeta = <Op extends ConditionOperator>(
  meta: ConditionOperatorMeta<Op>,
): ConditionOperatorMeta<Op> => meta;

export const CONDITION_OPERATOR_META = {
  and: defineConditionOperatorMeta({
    op: 'and',
    category: 'boolean',
    nestedConditionFields: [defineConditionField('args', (condition) => condition.args)],
  }),
  or: defineConditionOperatorMeta({
    op: 'or',
    category: 'boolean',
    nestedConditionFields: [defineConditionField('args', (condition) => condition.args)],
  }),
  not: defineConditionOperatorMeta({
    op: 'not',
    category: 'boolean',
    nestedConditionFields: [defineConditionField('arg', (condition) => condition.arg)],
  }),
  '==': defineConditionOperatorMeta({
    op: '==',
    category: 'comparison',
    valueFields: [
      defineConditionField('left', (condition) => condition.left),
      defineConditionField('right', (condition) => condition.right),
    ],
  }),
  '!=': defineConditionOperatorMeta({
    op: '!=',
    category: 'comparison',
    valueFields: [
      defineConditionField('left', (condition) => condition.left),
      defineConditionField('right', (condition) => condition.right),
    ],
  }),
  '<': defineConditionOperatorMeta({
    op: '<',
    category: 'comparison',
    valueFields: [
      defineConditionField('left', (condition) => condition.left),
      defineConditionField('right', (condition) => condition.right),
    ],
  }),
  '<=': defineConditionOperatorMeta({
    op: '<=',
    category: 'comparison',
    valueFields: [
      defineConditionField('left', (condition) => condition.left),
      defineConditionField('right', (condition) => condition.right),
    ],
  }),
  '>': defineConditionOperatorMeta({
    op: '>',
    category: 'comparison',
    valueFields: [
      defineConditionField('left', (condition) => condition.left),
      defineConditionField('right', (condition) => condition.right),
    ],
  }),
  '>=': defineConditionOperatorMeta({
    op: '>=',
    category: 'comparison',
    valueFields: [
      defineConditionField('left', (condition) => condition.left),
      defineConditionField('right', (condition) => condition.right),
    ],
  }),
  in: defineConditionOperatorMeta({
    op: 'in',
    category: 'membership',
    valueFields: [
      defineConditionField('item', (condition) => condition.item),
      defineConditionField('set', (condition) => condition.set),
    ],
  }),
  adjacent: defineConditionOperatorMeta({
    op: 'adjacent',
    category: 'spatial',
    zoneSelectorFields: [
      defineConditionField('left', (condition) => condition.left),
      defineConditionField('right', (condition) => condition.right),
    ],
  }),
  connected: defineConditionOperatorMeta({
    op: 'connected',
    category: 'spatial',
    zoneSelectorFields: [
      defineConditionField('from', (condition) => condition.from),
      defineConditionField('to', (condition) => condition.to),
    ],
    nestedConditionFields: [defineConditionField('via', (condition) => condition.via)],
  }),
  zonePropIncludes: defineConditionOperatorMeta({
    op: 'zonePropIncludes',
    category: 'membership',
    zoneSelectorFields: [defineConditionField('zone', (condition) => condition.zone)],
    valueFields: [defineConditionField('value', (condition) => condition.value)],
  }),
  markerStateAllowed: defineConditionOperatorMeta({
    op: 'markerStateAllowed',
    category: 'marker',
    zoneSelectorFields: [defineConditionField('space', (condition) => condition.space)],
    valueFields: [defineConditionField('state', (condition) => condition.state)],
  }),
  markerShiftAllowed: defineConditionOperatorMeta({
    op: 'markerShiftAllowed',
    category: 'marker',
    zoneSelectorFields: [defineConditionField('space', (condition) => condition.space)],
    numericValueFields: [defineConditionField('delta', (condition) => condition.delta)],
  }),
} as const satisfies { readonly [Op in ConditionOperator]: ConditionOperatorMeta<Op> };

const getTypedConditionOperatorMeta = <TCondition extends ConditionNode>(
  condition: TCondition,
): ConditionOperatorMeta<TCondition['op']> => CONDITION_OPERATOR_META[condition.op] as ConditionOperatorMeta<TCondition['op']>;

export const forEachConditionZoneSelectorField = <TCondition extends ConditionNode>(
  condition: TCondition,
  visit: (fieldName: string, value: ZoneSel) => void,
): void => {
  for (const field of getTypedConditionOperatorMeta(condition).zoneSelectorFields ?? []) {
    visit(field.name, field.get(condition as unknown as ConditionNodeByOp<TCondition['op']>));
  }
};

export const forEachConditionValueField = <TCondition extends ConditionNode>(
  condition: TCondition,
  visit: (fieldName: string, value: ValueExpr) => void,
): void => {
  for (const field of getTypedConditionOperatorMeta(condition).valueFields ?? []) {
    visit(field.name, field.get(condition as unknown as ConditionNodeByOp<TCondition['op']>));
  }
};

export const forEachConditionNumericValueField = <TCondition extends ConditionNode>(
  condition: TCondition,
  visit: (fieldName: string, value: NumericValueExpr) => void,
): void => {
  for (const field of getTypedConditionOperatorMeta(condition).numericValueFields ?? []) {
    visit(field.name, field.get(condition as unknown as ConditionNodeByOp<TCondition['op']>));
  }
};

export const forEachConditionNestedConditionField = <TCondition extends ConditionNode>(
  condition: TCondition,
  visit: (
    fieldName: string,
    value: ConditionAST | readonly ConditionAST[] | undefined,
  ) => void,
): void => {
  for (const field of getTypedConditionOperatorMeta(condition).nestedConditionFields ?? []) {
    visit(field.name, field.get(condition as unknown as ConditionNodeByOp<TCondition['op']>));
  }
};

export const isConditionOperator = (op: string): op is ConditionOperator => CONDITION_OPERATOR_SET.has(op);

export const getConditionOperatorMeta = <Op extends ConditionOperator>(op: Op): ConditionOperatorMeta<Op> =>
  CONDITION_OPERATOR_META[op] as ConditionOperatorMeta<Op>;
