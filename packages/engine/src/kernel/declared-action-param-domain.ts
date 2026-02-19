import { evalQuery, isInIntRangeDomain } from './eval-query.js';
import type { EvalContext } from './eval-context.js';
import type { ActionDef, MoveParamScalar, MoveParamValue } from './types.js';

const isMoveParamScalar = (value: unknown): value is MoveParamScalar =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

export const normalizeMoveParamValue = (value: unknown): MoveParamValue | null => {
  if (isMoveParamScalar(value)) {
    return value;
  }
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { readonly id?: unknown }).id;
    return isMoveParamScalar(id) ? id : null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const normalized: MoveParamScalar[] = [];
  for (const entry of value) {
    if (isMoveParamScalar(entry)) {
      normalized.push(entry);
      continue;
    }
    if (typeof entry === 'object' && entry !== null && 'id' in entry) {
      const id = (entry as { readonly id?: unknown }).id;
      if (isMoveParamScalar(id)) {
        normalized.push(id);
        continue;
      }
    }
    return null;
  }
  return normalized;
};

const isSameMoveParamValue = (left: MoveParamValue, right: MoveParamValue): boolean => {
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

export const isDeclaredActionParamValueInDomain = (
  param: ActionDef['params'][number],
  selected: unknown,
  evalCtx: EvalContext,
): boolean => {
  const selectedNormalized = normalizeMoveParamValue(selected);
  if (selectedNormalized === null) {
    return false;
  }
  if (
    param.domain.query === 'intsInRange'
    || param.domain.query === 'intsInVarRange'
  ) {
    return isInIntRangeDomain(param.domain, selectedNormalized, evalCtx);
  }
  const domainValues = evalQuery(param.domain, evalCtx);
  return domainValues.some((candidate) => {
    const normalizedCandidate = normalizeMoveParamValue(candidate);
    return normalizedCandidate !== null && isSameMoveParamValue(selectedNormalized, normalizedCandidate);
  });
};
