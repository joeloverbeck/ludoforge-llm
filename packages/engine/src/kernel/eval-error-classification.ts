import type { EvalErrorDeferClass } from './eval-error-defer-class.js';
import { type EvalError, isEvalErrorCode } from './eval-error.js';

export function hasEvalErrorDeferClass(
  error: unknown,
  deferClass: EvalErrorDeferClass,
): error is EvalError<'SELECTOR_CARDINALITY'> {
  return isEvalErrorCode(error, 'SELECTOR_CARDINALITY') && error.context?.deferClass === deferClass;
}

export function isRecoverableEvalResolutionError(error: unknown): boolean {
  return (
    isEvalErrorCode(error, 'DIVISION_BY_ZERO') ||
    isEvalErrorCode(error, 'MISSING_BINDING') ||
    isEvalErrorCode(error, 'MISSING_VAR')
  );
}
