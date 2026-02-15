import { typeMismatchError } from './eval-error.js';

export type MembershipScalar = string | number | boolean;
export interface ChoiceDomainNormalizationIssue {
  readonly index: number;
  readonly value: unknown;
  readonly actualType: string;
}

export function isMembershipScalar(value: unknown): value is MembershipScalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function normalizeScalarMembershipSet(
  setValue: unknown,
  context: Readonly<Record<string, unknown>>,
): { readonly set: readonly MembershipScalar[]; readonly setType: string | null } {
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
    if (!isMembershipScalar(entry)) {
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
    set: setValue as readonly MembershipScalar[],
    setType: expectedType,
  };
}

export function matchesScalarMembership(
  item: unknown,
  setValue: unknown,
  context: Readonly<Record<string, unknown>> = {},
): boolean {
  const normalized = normalizeScalarMembershipSet(setValue, context);
  if (!isMembershipScalar(item)) {
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

export function toChoiceComparableValue(value: unknown): MembershipScalar | null {
  if (isMembershipScalar(value)) {
    return value;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string'
  ) {
    return value.id;
  }
  return null;
}

export function normalizeChoiceDomain(
  domain: readonly unknown[],
  onInvalid: (issue: ChoiceDomainNormalizationIssue) => never,
): readonly MembershipScalar[] {
  const normalized: MembershipScalar[] = [];
  for (let index = 0; index < domain.length; index += 1) {
    const value = domain[index];
    const comparable = toChoiceComparableValue(value);
    if (comparable === null) {
      onInvalid({
        index,
        value,
        actualType: Array.isArray(value) ? 'array' : typeof value,
      });
    }
    normalized.push(comparable);
  }
  return normalized;
}

export function choiceValuesMatch(left: unknown, right: unknown): boolean {
  const leftComparable = toChoiceComparableValue(left);
  const rightComparable = toChoiceComparableValue(right);
  if (leftComparable === null || rightComparable === null) {
    return false;
  }
  return Object.is(leftComparable, rightComparable);
}

export function isInChoiceDomain(selected: unknown, domain: readonly unknown[]): boolean {
  return domain.some((candidate) => choiceValuesMatch(candidate, selected));
}
