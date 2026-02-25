import {
  EVAL_ERROR_DEFER_CLASSES_BY_CODE,
  type EvalErrorCodeWithDeferClass,
  type EvalErrorDeferClassForCode,
} from './eval-error-defer-class.js';
import { type EvalError, isEvalErrorCode } from './eval-error.js';

export function hasEvalErrorDeferClass<C extends EvalErrorCodeWithDeferClass>(
  error: unknown,
  code: C,
  deferClass: EvalErrorDeferClassForCode<C>,
): error is EvalError<C> {
  if (!isEvalErrorCode(error, code)) {
    return false;
  }
  const canonicalDeferClassesForCode = EVAL_ERROR_DEFER_CLASSES_BY_CODE[code];
  return canonicalDeferClassesForCode.includes(deferClass) && error.context?.deferClass === deferClass;
}

export function isRecoverableEvalResolutionError(error: unknown): boolean {
  return (
    isEvalErrorCode(error, 'DIVISION_BY_ZERO') ||
    isEvalErrorCode(error, 'MISSING_BINDING') ||
    isEvalErrorCode(error, 'MISSING_VAR')
  );
}
