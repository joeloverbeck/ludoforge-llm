import type { EvalError } from './eval-error.js';
import type { QueryResult } from './eval-query.js';
import { kernelRuntimeError } from './runtime-error.js';

/** Discriminated union for evalCondition outcomes. */
export type EvalConditionResult =
  | { readonly outcome: 'success'; readonly value: boolean }
  | { readonly outcome: 'error'; readonly error: EvalError };

/** Discriminated union for evalQuery outcomes. */
export type EvalQueryResult =
  | { readonly outcome: 'success'; readonly value: readonly QueryResult[] }
  | { readonly outcome: 'error'; readonly error: EvalError };

/** Factory for success results. */
export const evalSuccess = <T extends boolean | readonly QueryResult[]>(
  value: T,
): { readonly outcome: 'success'; readonly value: T } => ({ outcome: 'success', value });

/**
 * Unwrap an EvalConditionResult — returns the boolean on success, throws on error.
 * Used at normal-execution call sites where eval errors are genuine bugs.
 */
export const unwrapEvalCondition = (result: EvalConditionResult): boolean => {
  if (result.outcome === 'success') return result.value;
  throw kernelRuntimeError(
    'RUNTIME_CONTRACT_INVALID',
    `evalCondition returned error: ${result.error.message}`,
    undefined,
    result.error,
  );
};

/**
 * Unwrap an EvalQueryResult — returns the QueryResult array on success, throws on error.
 * Used at normal-execution call sites where eval errors are genuine bugs.
 */
export const unwrapEvalQuery = (result: EvalQueryResult): readonly QueryResult[] => {
  if (result.outcome === 'success') return result.value;
  throw kernelRuntimeError(
    'RUNTIME_CONTRACT_INVALID',
    `evalQuery returned error: ${result.error.message}`,
    undefined,
    result.error,
  );
};
