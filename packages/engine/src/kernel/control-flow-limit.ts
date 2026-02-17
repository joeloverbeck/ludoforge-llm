import { evalValue } from './eval-value.js';
import type { EvalContext } from './eval-context.js';
import type { NumericValueExpr } from './types.js';

export const DEFAULT_CONTROL_FLOW_ITERATION_LIMIT = 100;

export type ControlFlowEffectType = 'forEach' | 'reduce';

export const resolveControlFlowIterationLimit = (
  effectType: ControlFlowEffectType,
  limitExpr: NumericValueExpr | undefined,
  evalCtx: EvalContext,
  onInvalidLimit: (evaluatedLimit: unknown) => number,
): number => {
  if (limitExpr === undefined) {
    return DEFAULT_CONTROL_FLOW_ITERATION_LIMIT;
  }

  const limitValue = evalValue(limitExpr, evalCtx);
  if (typeof limitValue !== 'number' || !Number.isSafeInteger(limitValue) || limitValue < 0) {
    return onInvalidLimit(limitValue);
  }
  return limitValue;
};
