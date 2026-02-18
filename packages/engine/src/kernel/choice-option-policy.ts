import type { ChoiceOption, ChoicePendingRequest, MoveParamScalar, MoveParamValue } from './types.js';

export interface ChoiceOptionPolicy {
  readonly allowIllegalFallback?: boolean;
}

const optionKey = (value: unknown): string => JSON.stringify([typeof value, value]);

const partitionOptionsByLegality = (
  options: readonly ChoiceOption[],
): {
  readonly legal: readonly ChoiceOption[];
  readonly unknown: readonly ChoiceOption[];
  readonly illegal: readonly ChoiceOption[];
} => {
  const legal: ChoiceOption[] = [];
  const unknown: ChoiceOption[] = [];
  const illegal: ChoiceOption[] = [];
  for (const option of options) {
    if (option.legality === 'legal') {
      legal.push(option);
      continue;
    }
    if (option.legality === 'unknown') {
      unknown.push(option);
      continue;
    }
    illegal.push(option);
  }
  return { legal, unknown, illegal };
};

export const selectChoiceOptionsByLegalityPrecedence = (
  request: ChoicePendingRequest,
  policy?: ChoiceOptionPolicy,
): readonly ChoiceOption[] => {
  const partitions = partitionOptionsByLegality(request.options);
  if (partitions.legal.length > 0) {
    return partitions.legal;
  }
  if (partitions.unknown.length > 0) {
    return partitions.unknown;
  }
  if (policy?.allowIllegalFallback === true) {
    return partitions.illegal;
  }
  return [];
};

export const selectChoiceOptionValuesByLegalityPrecedence = (
  request: ChoicePendingRequest,
  policy?: ChoiceOptionPolicy,
): readonly MoveParamValue[] =>
  selectChoiceOptionsByLegalityPrecedence(request, policy).map((option) => option.value);

export const selectUniqueChoiceOptionValuesByLegalityPrecedence = (
  request: ChoicePendingRequest,
  policy?: ChoiceOptionPolicy,
): readonly MoveParamValue[] => {
  const values = selectChoiceOptionValuesByLegalityPrecedence(request, policy);
  const uniqueValues: MoveParamValue[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = optionKey(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueValues.push(value);
  }
  return uniqueValues;
};

export const pickDeterministicChoiceValue = (
  request: ChoicePendingRequest,
  policy?: ChoiceOptionPolicy,
): MoveParamValue | undefined => {
  const values = request.type === 'chooseOne'
    ? selectChoiceOptionValuesByLegalityPrecedence(request, policy)
    : selectUniqueChoiceOptionValuesByLegalityPrecedence(request, policy);
  if (request.type === 'chooseOne') {
    const selected = values[0];
    return selected === undefined ? undefined : (selected as MoveParamScalar);
  }

  const min = request.min ?? 0;
  if (values.length < min) {
    return undefined;
  }
  return values.slice(0, min) as MoveParamScalar[];
};
