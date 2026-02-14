import type { EvalContext } from './eval-context.js';
import { evalValue } from './eval-value.js';
import type { EffectAST } from './types.js';

type ChooseNDef = Extract<EffectAST, { readonly chooseN: unknown }>['chooseN'];

export type ChooseNCardinalityIssue =
  | {
      readonly code: 'CHOOSE_N_MODE_INVALID';
      readonly chooseN: ChooseNDef;
    }
  | {
      readonly code: 'CHOOSE_N_MIN_EVAL_INVALID';
      readonly chooseN: ChooseNDef;
      readonly value: unknown;
    }
  | {
      readonly code: 'CHOOSE_N_MAX_EVAL_INVALID';
      readonly chooseN: ChooseNDef;
      readonly value: unknown;
    }
  | {
      readonly code: 'CHOOSE_N_MIN_INVALID';
      readonly chooseN: ChooseNDef;
      readonly value: unknown;
    }
  | {
      readonly code: 'CHOOSE_N_MAX_INVALID';
      readonly chooseN: ChooseNDef;
      readonly value: unknown;
    }
  | {
      readonly code: 'CHOOSE_N_RANGE_INVALID';
      readonly chooseN: ChooseNDef;
      readonly min: number;
      readonly max: number;
    };

export interface ChooseNCardinality {
  readonly minCardinality: number;
  readonly maxCardinality: number;
}

export function resolveChooseNCardinality(
  chooseN: ChooseNDef,
  evalCtx: EvalContext,
  onIssue: (issue: ChooseNCardinalityIssue) => never,
): ChooseNCardinality {
  const hasN = 'n' in chooseN && chooseN.n !== undefined;
  const hasMax = 'max' in chooseN && chooseN.max !== undefined;
  const hasMin = 'min' in chooseN && chooseN.min !== undefined;

  if (hasN && hasMax) {
    return onIssue({ code: 'CHOOSE_N_MODE_INVALID', chooseN });
  }
  if (!hasN && !hasMax) {
    return onIssue({ code: 'CHOOSE_N_MODE_INVALID', chooseN });
  }

  let minCardinality: number;
  let maxCardinality: number;

  if (hasN) {
    minCardinality = chooseN.n;
    maxCardinality = chooseN.n;
  } else {
    const minValue = hasMin ? evalValue(chooseN.min, evalCtx) : 0;
    const maxValue = evalValue(chooseN.max, evalCtx);

    if (typeof minValue !== 'number' || !Number.isSafeInteger(minValue) || minValue < 0) {
      return onIssue({ code: 'CHOOSE_N_MIN_EVAL_INVALID', chooseN, value: minValue });
    }

    if (typeof maxValue !== 'number' || !Number.isSafeInteger(maxValue) || maxValue < 0) {
      return onIssue({ code: 'CHOOSE_N_MAX_EVAL_INVALID', chooseN, value: maxValue });
    }

    minCardinality = minValue;
    maxCardinality = maxValue;
  }

  if (!Number.isSafeInteger(minCardinality) || minCardinality < 0) {
    return onIssue({ code: 'CHOOSE_N_MIN_INVALID', chooseN, value: minCardinality });
  }

  if (!Number.isSafeInteger(maxCardinality) || maxCardinality < 0) {
    return onIssue({ code: 'CHOOSE_N_MAX_INVALID', chooseN, value: maxCardinality });
  }

  if (minCardinality > maxCardinality) {
    return onIssue({ code: 'CHOOSE_N_RANGE_INVALID', chooseN, min: minCardinality, max: maxCardinality });
  }

  return { minCardinality, maxCardinality };
}
