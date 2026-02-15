import { typeMismatchError } from './eval-error.js';

export type PredicateOp = 'eq' | 'neq' | 'in' | 'notIn';
export type PredicateScalar = string | number | boolean;
export type PredicateSet = readonly PredicateScalar[];
export type PredicateValue = PredicateScalar | PredicateSet;

export interface ResolvedRowPredicate<FieldKey extends string = string> {
  readonly field: FieldKey;
  readonly op: PredicateOp;
  readonly value: PredicateValue;
}

function isPredicateScalar(value: unknown): value is PredicateScalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function normalizePredicateSet(
  setValue: unknown,
  context: Readonly<Record<string, unknown>>,
): { readonly set: PredicateSet; readonly setType: string | null } {
  if (!Array.isArray(setValue)) {
    throw typeMismatchError('Predicate membership operators require array values', {
      ...context,
      actualType: typeof setValue,
      value: setValue,
    });
  }

  let expectedType: string | null = null;
  for (let index = 0; index < setValue.length; index += 1) {
    const entry = setValue[index];
    if (!isPredicateScalar(entry)) {
      throw typeMismatchError('Predicate membership set must contain only scalar values', {
        ...context,
        setValue,
        setIndex: index,
        actualType: Array.isArray(entry) ? 'array' : typeof entry,
        value: entry,
      });
    }

    const entryType = typeof entry;
    if (expectedType === null) {
      expectedType = entryType;
      continue;
    }
    if (entryType !== expectedType) {
      throw typeMismatchError('Predicate membership set cannot mix scalar types', {
        ...context,
        setValue,
        expectedType,
        actualType: entryType,
        setIndex: index,
      });
    }
  }
  return {
    set: setValue as PredicateSet,
    setType: expectedType,
  };
}

export function matchesMembership(
  item: unknown,
  setValue: unknown,
  context: Readonly<Record<string, unknown>> = {},
): boolean {
  const normalized = normalizePredicateSet(setValue, context);
  if (!isPredicateScalar(item)) {
    throw typeMismatchError('Predicate membership item value must be a scalar', {
      ...context,
      actualType: Array.isArray(item) ? 'array' : typeof item,
      value: item,
    });
  }

  if (normalized.setType !== null && typeof item !== normalized.setType) {
    throw typeMismatchError('Predicate membership item/set scalar types must match', {
      ...context,
      itemType: typeof item,
      setType: normalized.setType,
      itemValue: item,
      setValue: normalized.set,
    });
  }

  return normalized.set.includes(item);
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
