import type { MoveParamScalar, MoveParamValue } from './types.js';

export const isMoveParamScalar = (value: unknown): value is MoveParamScalar =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

export const toMoveParamComparableScalar = (value: unknown): MoveParamScalar | null => {
  if (isMoveParamScalar(value)) {
    return value;
  }
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { readonly id?: unknown }).id;
    return isMoveParamScalar(id) ? id : null;
  }
  return null;
};

export const normalizeMoveParamValue = (value: unknown): MoveParamValue | null => {
  const scalar = toMoveParamComparableScalar(value);
  if (scalar !== null) {
    return scalar;
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized: MoveParamScalar[] = [];
  for (const entry of value) {
    const normalizedEntry = toMoveParamComparableScalar(entry);
    if (normalizedEntry === null) {
      return null;
    }
    normalized.push(normalizedEntry);
  }
  return normalized;
};

export const moveParamValuesEqual = (left: MoveParamValue, right: MoveParamValue): boolean => {
  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);
  if (leftIsArray || rightIsArray) {
    if (!leftIsArray || !rightIsArray || left.length !== right.length) {
      return false;
    }
    return left.every((entry, index) => Object.is(entry, right[index]));
  }
  return Object.is(left, right);
};
