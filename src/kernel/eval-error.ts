export type EvalErrorCode =
  | 'MISSING_BINDING'
  | 'MISSING_VAR'
  | 'TYPE_MISMATCH'
  | 'SELECTOR_CARDINALITY'
  | 'QUERY_BOUNDS_EXCEEDED'
  | 'SPATIAL_NOT_IMPLEMENTED';

export type EvalErrorContext = Readonly<Record<string, unknown>>;

function formatMessage(message: string, context?: EvalErrorContext): string {
  if (context === undefined) {
    return message;
  }

  return `${message} context=${JSON.stringify(context)}`;
}

export class EvalError extends Error {
  readonly code: EvalErrorCode;
  readonly context?: EvalErrorContext;

  constructor(code: EvalErrorCode, message: string, context?: EvalErrorContext) {
    super(formatMessage(message, context));
    this.name = 'EvalError';
    this.code = code;
    if (context !== undefined) {
      this.context = context;
    }
  }
}

export function createEvalError(
  code: EvalErrorCode,
  message: string,
  context?: EvalErrorContext,
): EvalError {
  return new EvalError(code, message, context);
}

export function missingBindingError(message: string, context?: EvalErrorContext): EvalError {
  return createEvalError('MISSING_BINDING', message, context);
}

export function missingVarError(message: string, context?: EvalErrorContext): EvalError {
  return createEvalError('MISSING_VAR', message, context);
}

export function typeMismatchError(message: string, context?: EvalErrorContext): EvalError {
  return createEvalError('TYPE_MISMATCH', message, context);
}

export function selectorCardinalityError(message: string, context?: EvalErrorContext): EvalError {
  return createEvalError('SELECTOR_CARDINALITY', message, context);
}

export function queryBoundsExceededError(message: string, context?: EvalErrorContext): EvalError {
  return createEvalError('QUERY_BOUNDS_EXCEEDED', message, context);
}

export function spatialNotImplementedError(message: string, context?: EvalErrorContext): EvalError {
  return createEvalError('SPATIAL_NOT_IMPLEMENTED', message, context);
}

export function isEvalError(error: unknown): error is EvalError {
  return error instanceof EvalError;
}

export function isEvalErrorCode<C extends EvalErrorCode>(
  error: unknown,
  code: C,
): error is EvalError & { readonly code: C } {
  return isEvalError(error) && error.code === code;
}
