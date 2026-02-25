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

export const EVAL_ERROR_DEFER_CLASS = {
  UNRESOLVED_BINDING_SELECTOR_CARDINALITY: 'unresolvedBindingSelectorCardinality',
} as const;

export type EvalErrorDeferClass = (typeof EVAL_ERROR_DEFER_CLASS)[keyof typeof EVAL_ERROR_DEFER_CLASS];

export type SelectorCardinalityEvalErrorContext = EvalErrorContext & {
  readonly deferClass?: EvalErrorDeferClass;
};

type EvalErrorContextByCode = {
  readonly SELECTOR_CARDINALITY: SelectorCardinalityEvalErrorContext;
};

export type EvalErrorContextForCode<C extends EvalErrorCode> =
  C extends keyof EvalErrorContextByCode ? EvalErrorContextByCode[C] : EvalErrorContext;

function formatMessage<C extends EvalErrorCode>(message: string, context?: EvalErrorContextForCode<C>): string {
  if (context === undefined) {
    return message;
  }

  return `${message} context=${JSON.stringify(context)}`;
}

export class EvalError<C extends EvalErrorCode = EvalErrorCode> extends Error {
  readonly code: C;
  readonly context?: EvalErrorContextForCode<C>;

  constructor(code: C, message: string, context?: EvalErrorContextForCode<C>) {
    super(formatMessage(message, context));
    this.name = 'EvalError';
    this.code = code;
    if (context !== undefined) {
      this.context = context;
    }
  }
}

export function createEvalError<C extends EvalErrorCode>(
  code: C,
  message: string,
  context?: EvalErrorContextForCode<C>,
): EvalError<C> {
  return new EvalError(code, message, context);
}

export function missingBindingError(
  message: string,
  context?: EvalErrorContextForCode<'MISSING_BINDING'>,
): EvalError<'MISSING_BINDING'> {
  return createEvalError('MISSING_BINDING', message, context);
}

export function missingVarError(
  message: string,
  context?: EvalErrorContextForCode<'MISSING_VAR'>,
): EvalError<'MISSING_VAR'> {
  return createEvalError('MISSING_VAR', message, context);
}

export function typeMismatchError(
  message: string,
  context?: EvalErrorContextForCode<'TYPE_MISMATCH'>,
): EvalError<'TYPE_MISMATCH'> {
  return createEvalError('TYPE_MISMATCH', message, context);
}

export function selectorCardinalityError(
  message: string,
  context?: EvalErrorContextForCode<'SELECTOR_CARDINALITY'>,
): EvalError<'SELECTOR_CARDINALITY'> {
  return createEvalError('SELECTOR_CARDINALITY', message, context);
}

export function queryBoundsExceededError(
  message: string,
  context?: EvalErrorContextForCode<'QUERY_BOUNDS_EXCEEDED'>,
): EvalError<'QUERY_BOUNDS_EXCEEDED'> {
  return createEvalError('QUERY_BOUNDS_EXCEEDED', message, context);
}

export function spatialNotImplementedError(
  message: string,
  context?: EvalErrorContextForCode<'SPATIAL_NOT_IMPLEMENTED'>,
): EvalError<'SPATIAL_NOT_IMPLEMENTED'> {
  return createEvalError('SPATIAL_NOT_IMPLEMENTED', message, context);
}

export function divisionByZeroError(
  message: string,
  context?: EvalErrorContextForCode<'DIVISION_BY_ZERO'>,
): EvalError<'DIVISION_BY_ZERO'> {
  return createEvalError('DIVISION_BY_ZERO', message, context);
}

export function zonePropNotFoundError(
  message: string,
  context?: EvalErrorContextForCode<'ZONE_PROP_NOT_FOUND'>,
): EvalError<'ZONE_PROP_NOT_FOUND'> {
  return createEvalError('ZONE_PROP_NOT_FOUND', message, context);
}

export function dataAssetEvalError(
  code: DataAssetEvalErrorCode,
  message: string,
  context?: EvalErrorContextForCode<DataAssetEvalErrorCode>,
): EvalError<DataAssetEvalErrorCode> {
  return createEvalError(code, message, context);
}

export function isEvalError(error: unknown): error is EvalError<EvalErrorCode> {
  return error instanceof EvalError;
}

export function isEvalErrorCode<C extends EvalErrorCode>(
  error: unknown,
  code: C,
): error is EvalError<C> {
  return isEvalError(error) && error.code === code;
}

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
