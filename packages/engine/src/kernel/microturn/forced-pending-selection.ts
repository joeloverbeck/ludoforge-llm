import type { ChoicePendingRequest, MoveParamScalar, MoveParamValue } from '../types.js';

const choiceValueKey = (value: unknown): string => JSON.stringify([typeof value, value]);

export const resolveForcedPendingSelection = (request: ChoicePendingRequest): MoveParamValue | undefined => {
  if (request.type !== 'chooseN') {
    return undefined;
  }

  const selectedKeys = new Set(request.selected.map((value) => choiceValueKey(value)));
  const seenRemainingKeys = new Set<string>();
  const remainingSelectable = request.options
    .filter((option) => option.legality !== 'illegal')
    .map((option) => option.value)
    .filter((value): value is MoveParamScalar => !Array.isArray(value))
    .filter((value) => {
      const key = choiceValueKey(value);
      if (selectedKeys.has(key) || seenRemainingKeys.has(key)) {
        return false;
      }
      seenRemainingKeys.add(key);
      return true;
    });
  const min = request.min ?? 0;
  const max = request.max ?? (request.selected.length + remainingSelectable.length);

  if (remainingSelectable.length === 0 && request.canConfirm) {
    return [...request.selected];
  }

  if (request.decisionPlayer !== undefined) {
    return undefined;
  }

  if (min !== max) {
    return undefined;
  }

  const requiredRemaining = Math.max(0, min - request.selected.length);
  return remainingSelectable.length === requiredRemaining
    ? [...request.selected, ...remainingSelectable]
    : undefined;
};
