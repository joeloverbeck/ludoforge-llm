import { typeMismatchError } from './eval-error.js';
import { matchesScalarMembership } from './value-membership.js';

export type PredicateOp = 'eq' | 'neq' | 'in' | 'notIn';
export type PredicateScalar = string | number | boolean;
export type PredicateSet = readonly PredicateScalar[];
export type PredicateValue = PredicateScalar | PredicateSet;

export interface ResolvedRowPredicate<FieldKey extends string = string> {
  readonly field: FieldKey;
  readonly op: PredicateOp;
  readonly value: PredicateValue;
}

export function matchesMembership(
  item: unknown,
  setValue: unknown,
  context: Readonly<Record<string, unknown>> = {},
): boolean {
  return matchesScalarMembership(item, setValue, context);
}

export function matchesResolvedPredicate(
  fieldValue: unknown,
  predicate: ResolvedRowPredicate,
  context: Readonly<Record<string, unknown>> = {},
): boolean {
  if (fieldValue === undefined) {
    return false;
  }

  const { op, value } = predicate;

  if (op === 'eq' || op === 'neq') {
    if (Array.isArray(value)) {
      throw typeMismatchError('Predicate eq/neq operators require scalar values', {
        ...context,
        predicate,
        actualType: 'array',
      });
    }
    return op === 'eq' ? fieldValue === value : fieldValue !== value;
  }

  const contains = matchesMembership(fieldValue, value, { ...context, predicate });
  return op === 'in' ? contains : !contains;
}

export function filterRowsByPredicates<Row, FieldKey extends string>(
  rows: readonly Row[],
  predicates: readonly ResolvedRowPredicate<FieldKey>[],
  options: {
    readonly getFieldValue: (row: Row, field: FieldKey) => unknown;
    readonly context?: (predicate: ResolvedRowPredicate<FieldKey>, row: Row) => Readonly<Record<string, unknown>>;
  },
): readonly Row[] {
  if (predicates.length === 0) {
    return [...rows];
  }
  return rows.filter((row) =>
    predicates.every((predicate) =>
      matchesResolvedPredicate(
        options.getFieldValue(row, predicate.field),
        predicate,
        options.context?.(predicate, row) ?? { predicate },
      ),
    ),
  );
}
