/**
 * Result type for choice validation operations.
 *
 * Follows the established EvalConditionResult / EvalQueryResult pattern
 * (outcome: 'success' | 'error' discriminant). Used to convert
 * throw-for-control-flow in the choice subsystem to result-returning.
 */

/** Discriminated union for choice validation outcomes. */
export type ChoiceValidationResult<T> =
  | { readonly outcome: 'success'; readonly value: T }
  | { readonly outcome: 'error'; readonly error: ChoiceValidationError };

/** Constant for the choice validation error code. */
export const CHOICE_VALIDATION_ERROR_CODE = 'CHOICE_RUNTIME_VALIDATION_FAILED' as const;

/** Structured error for choice validation failures. */
export type ChoiceValidationError = {
  readonly code: typeof CHOICE_VALIDATION_ERROR_CODE;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
};

/** Factory for choice validation success results. */
export const choiceValidationSuccess = <T>(value: T): ChoiceValidationResult<T> => ({
  outcome: 'success',
  value,
});

/** Factory for choice validation failure results. */
export const choiceValidationFailed = (
  message: string,
  context?: Readonly<Record<string, unknown>>,
): ChoiceValidationResult<never> => ({
  outcome: 'error',
  error: {
    code: CHOICE_VALIDATION_ERROR_CODE,
    message,
    ...(context !== undefined ? { context } : {}),
  },
});
