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

export interface ConditionOperatorMeta {
  readonly op: ConditionOperator;
  readonly category: 'boolean' | 'comparison' | 'spatial' | 'marker' | 'membership';
  readonly valueFields?: readonly string[];
  readonly numericValueFields?: readonly string[];
  readonly zoneSelectorFields?: readonly string[];
  readonly nestedConditionFields?: readonly string[];
}

const defineConditionOperatorMeta = (meta: ConditionOperatorMeta): ConditionOperatorMeta => meta;

const CONDITION_OPERATOR_META_ENTRIES = [
  defineConditionOperatorMeta({ op: 'and', category: 'boolean', nestedConditionFields: ['args'] }),
  defineConditionOperatorMeta({ op: 'or', category: 'boolean', nestedConditionFields: ['args'] }),
  defineConditionOperatorMeta({ op: 'not', category: 'boolean', nestedConditionFields: ['arg'] }),
  defineConditionOperatorMeta({ op: '==', category: 'comparison', valueFields: ['left', 'right'] }),
  defineConditionOperatorMeta({ op: '!=', category: 'comparison', valueFields: ['left', 'right'] }),
  defineConditionOperatorMeta({ op: '<', category: 'comparison', valueFields: ['left', 'right'] }),
  defineConditionOperatorMeta({ op: '<=', category: 'comparison', valueFields: ['left', 'right'] }),
  defineConditionOperatorMeta({ op: '>', category: 'comparison', valueFields: ['left', 'right'] }),
  defineConditionOperatorMeta({ op: '>=', category: 'comparison', valueFields: ['left', 'right'] }),
  defineConditionOperatorMeta({ op: 'in', category: 'membership', valueFields: ['item', 'set'] }),
  defineConditionOperatorMeta({ op: 'adjacent', category: 'spatial', zoneSelectorFields: ['left', 'right'] }),
  defineConditionOperatorMeta({ op: 'connected', category: 'spatial', zoneSelectorFields: ['from', 'to'], nestedConditionFields: ['via'] }),
  defineConditionOperatorMeta({ op: 'zonePropIncludes', category: 'membership', zoneSelectorFields: ['zone'], valueFields: ['value'] }),
  defineConditionOperatorMeta({ op: 'markerStateAllowed', category: 'marker', zoneSelectorFields: ['space'], valueFields: ['state'] }),
  defineConditionOperatorMeta({ op: 'markerShiftAllowed', category: 'marker', zoneSelectorFields: ['space'], numericValueFields: ['delta'] }),
] as const satisfies readonly ConditionOperatorMeta[];

const CONDITION_OPERATOR_SET: ReadonlySet<string> = new Set<string>(CONDITION_OPERATORS);

const assertConditionOperatorMetaCoverage = (): void => {
  const seen = new Set<ConditionOperator>();
  for (const meta of CONDITION_OPERATOR_META_ENTRIES) {
    if (seen.has(meta.op)) {
      throw new Error(`Duplicate condition operator metadata entry: ${meta.op}`);
    }
    seen.add(meta.op);
  }
  for (const op of CONDITION_OPERATORS) {
    if (!seen.has(op)) {
      throw new Error(`Missing condition operator metadata entry: ${op}`);
    }
  }
};

assertConditionOperatorMetaCoverage();

export const CONDITION_OPERATOR_META: ReadonlyMap<ConditionOperator, ConditionOperatorMeta> = new Map(
  CONDITION_OPERATOR_META_ENTRIES.map((meta) => [meta.op, meta] as const),
);

export const isConditionOperator = (op: string): op is ConditionOperator => CONDITION_OPERATOR_SET.has(op);

export const getConditionOperatorMeta = (op: ConditionOperator): ConditionOperatorMeta => {
  const meta = CONDITION_OPERATOR_META.get(op);
  if (meta === undefined) {
    throw new Error(`Missing condition operator metadata: ${op}`);
  }
  return meta;
};
