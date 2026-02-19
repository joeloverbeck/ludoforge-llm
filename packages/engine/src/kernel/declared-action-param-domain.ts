import { evalQuery, isInIntRangeDomain } from './eval-query.js';
import type { EvalContext } from './eval-context.js';
import { moveParamValuesEqual, normalizeMoveParamValue } from './move-param-normalization.js';
import type { ActionDef } from './types.js';

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
    return normalizedCandidate !== null && moveParamValuesEqual(selectedNormalized, normalizedCandidate);
  });
};
