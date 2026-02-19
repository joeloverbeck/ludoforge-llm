import { evalQuery, isInIntRangeDomain } from './eval-query.js';
import type { EvalContext } from './eval-context.js';
import { moveParamValuesEqual, normalizeMoveParamValue } from './move-param-normalization.js';
import type { ActionDef, MoveParamValue } from './types.js';

export interface DeclaredActionParamDomainOptionsResolution {
  readonly options: readonly MoveParamValue[];
  readonly invalidOption?: {
    readonly index: number;
    readonly actualType: string;
    readonly value: unknown;
  };
}

export const resolveDeclaredActionParamDomainOptions = (
  param: ActionDef['params'][number],
  evalCtx: EvalContext,
): DeclaredActionParamDomainOptionsResolution => {
  const options = evalQuery(param.domain, evalCtx);
  const normalizedOptions: MoveParamValue[] = [];
  for (const [index, value] of options.entries()) {
    const normalized = normalizeMoveParamValue(value);
    if (normalized === null) {
      return {
        options: normalizedOptions,
        invalidOption: {
          index,
          actualType: Array.isArray(value) ? 'array' : typeof value,
          value,
        },
      };
    }
    normalizedOptions.push(normalized);
  }
  return { options: normalizedOptions };
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
  const resolution = resolveDeclaredActionParamDomainOptions(param, evalCtx);
  return resolution.options.some((candidate) => moveParamValuesEqual(selectedNormalized, candidate));
};
