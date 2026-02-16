export type DataAssetEvalErrorCode =
  | 'DATA_ASSET_TABLE_CONTRACT_MISSING'
  | 'DATA_ASSET_RUNTIME_ASSET_MISSING'
  | 'DATA_ASSET_TABLE_PATH_EMPTY'
  | 'DATA_ASSET_TABLE_PATH_MISSING'
  | 'DATA_ASSET_TABLE_PATH_TYPE_INVALID'
  | 'DATA_ASSET_TABLE_TYPE_INVALID'
  | 'DATA_ASSET_ROW_TYPE_INVALID'
  | 'DATA_ASSET_ROW_BINDING_TYPE_INVALID'
  | 'DATA_ASSET_FIELD_UNDECLARED'
  | 'DATA_ASSET_FIELD_MISSING'
  | 'DATA_ASSET_FIELD_TYPE_INVALID'
  | 'DATA_ASSET_CARDINALITY_NO_MATCH'
  | 'DATA_ASSET_CARDINALITY_MULTIPLE_MATCHES';

export type EvalErrorCode =
  | 'MISSING_BINDING'
  | 'MISSING_VAR'
  | 'TYPE_MISMATCH'
  | 'SELECTOR_CARDINALITY'
  | 'QUERY_BOUNDS_EXCEEDED'
  | 'SPATIAL_NOT_IMPLEMENTED'
  | 'DIVISION_BY_ZERO'
  | 'ZONE_PROP_NOT_FOUND'
  | DataAssetEvalErrorCode;

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

export function divisionByZeroError(message: string, context?: EvalErrorContext): EvalError {
  return createEvalError('DIVISION_BY_ZERO', message, context);
}

export function zonePropNotFoundError(message: string, context?: EvalErrorContext): EvalError {
  return createEvalError('ZONE_PROP_NOT_FOUND', message, context);
}

export function dataAssetEvalError(
  code: DataAssetEvalErrorCode,
  message: string,
  context?: EvalErrorContext,
): EvalError {
  return createEvalError(code, message, context);
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
