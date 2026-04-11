import type { ChoiceOption, ChoicePendingRequest, GameState, MoveParamScalar, MoveParamValue } from './types.js';

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

export const estimateMoveParamValueComplexity = (
  state: GameState,
  value: MoveParamValue,
): number => {
  if (typeof value === 'string') {
    return state.zones[value]?.length ?? 0;
  }
  if (Array.isArray(value)) {
    return value.reduce((score, item) => (
      typeof item === 'string'
        ? score + (state.zones[item]?.length ?? 0)
        : score
    ), 0);
  }
  return 0;
};

export const orderMoveParamValuesByAscendingComplexity = (
  state: GameState,
  values: readonly MoveParamValue[],
): readonly MoveParamValue[] => (
  [...values].sort((left, right) => estimateMoveParamValueComplexity(state, left) - estimateMoveParamValueComplexity(state, right))
);

export const pickDeterministicChoiceValue = (
  request: ChoicePendingRequest,
  policy?: ChoiceOptionPolicy,
): MoveParamValue | undefined => {
  if (request.type === 'chooseOne') {
    const values = selectChoiceOptionValuesByLegalityPrecedence(request, policy);
    const selected = values[0];
    return selected === undefined ? undefined : (selected as MoveParamScalar);
  }

  const values = selectUniqueChoiceOptionValuesByLegalityPrecedence(request, policy);
  const min = request.min ?? 0;
  if (values.length < min) {
    return undefined;
  }
  return values.slice(0, min) as MoveParamScalar[];
};
