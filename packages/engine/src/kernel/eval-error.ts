import type { PlayerId, ZoneId } from './branded.js';
import type { EvalErrorDeferClass } from './eval-error-defer-class.js';
import type { ConditionAST, OptionsQuery, PlayerSel, Reference, ValueExpr, ZoneSel } from './types.js';

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

export type SelectorCardinalityPlayerCountEvalErrorContext = {
  readonly selectorKind: 'player';
  readonly selector: PlayerSel;
  readonly playerCount: number;
  readonly resolvedCount?: never;
  readonly resolvedPlayers?: never;
  readonly resolvedZones?: never;
  readonly deferClass?: never;
};

export type SelectorCardinalityPlayerResolvedEvalErrorContext = {
  readonly selectorKind: 'player';
  readonly selector: PlayerSel;
  readonly playerCount?: never;
  readonly resolvedCount: number;
  readonly resolvedPlayers: readonly PlayerId[];
  readonly resolvedZones?: never;
  readonly deferClass?: never;
};

export type SelectorCardinalityPlayerEvalErrorContext =
  | SelectorCardinalityPlayerCountEvalErrorContext
  | SelectorCardinalityPlayerResolvedEvalErrorContext;

export type SelectorCardinalityZoneEvalErrorContext = {
  readonly selectorKind: 'zone';
  readonly selector: ZoneSel;
  readonly playerCount?: never;
  readonly resolvedPlayers?: never;
  readonly resolvedCount: number;
  readonly resolvedZones: readonly ZoneId[];
  readonly deferClass?: EvalErrorDeferClass;
};

export type TypedSelectorCardinalityEvalErrorContext =
  | SelectorCardinalityPlayerEvalErrorContext
  | SelectorCardinalityZoneEvalErrorContext;

export type QueryBoundsExceededEvalErrorContext = {
  readonly query: OptionsQuery;
  readonly maxQueryResults: number;
  readonly resultLength: number;
};

export type DivisionByZeroEvalErrorContext = {
  readonly expr: ValueExpr;
  readonly left: number;
  readonly right: number;
};

export type ZonePropNotFoundEvalErrorContext = {
  readonly zoneId: ZoneId;
  readonly prop?: string;
  readonly availableZoneIds?: readonly ZoneId[];
  readonly availableProps?: readonly string[];
  readonly reference?: Extract<Reference, { readonly ref: 'zoneProp' }>;
  readonly condition?: Extract<ConditionAST, { readonly op: 'zonePropIncludes' }>;
};

type EvalErrorContextByCode = {
  readonly SELECTOR_CARDINALITY: TypedSelectorCardinalityEvalErrorContext;
  readonly QUERY_BOUNDS_EXCEEDED: QueryBoundsExceededEvalErrorContext;
  readonly DIVISION_BY_ZERO: DivisionByZeroEvalErrorContext;
  readonly ZONE_PROP_NOT_FOUND: ZonePropNotFoundEvalErrorContext;
};

export type EvalErrorContextForCode<C extends EvalErrorCode> =
  C extends keyof EvalErrorContextByCode ? EvalErrorContextByCode[C] : EvalErrorContext;

export type ExactEvalErrorContext<
  C extends EvalErrorCode,
  T extends EvalErrorContextForCode<C>,
> = T & Readonly<Record<Exclude<keyof T, keyof EvalErrorContextForCode<C>>, never>>;

export class EvalError<C extends EvalErrorCode = EvalErrorCode> extends Error {
  readonly code: C;
  readonly context?: EvalErrorContextForCode<C>;

  constructor(code: C, message: string, context?: EvalErrorContextForCode<C>) {
    super(message);
    this.name = 'EvalError';
    this.code = code;
    if (context !== undefined) {
      this.context = context;
    }
  }
}

export function createEvalError<
  C extends EvalErrorCode,
  T extends EvalErrorContextForCode<C> = EvalErrorContextForCode<C>,
>(
  code: C,
  message: string,
  context?: ExactEvalErrorContext<C, T>,
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
  return createEvalError<'SELECTOR_CARDINALITY'>('SELECTOR_CARDINALITY', message, context);
}

export function selectorCardinalityPlayerCountContext(
  selector: PlayerSel,
  playerCount: number,
): SelectorCardinalityPlayerCountEvalErrorContext {
  return {
    selectorKind: 'player',
    selector,
    playerCount,
  };
}

export function selectorCardinalityPlayerResolvedContext(
  selector: PlayerSel,
  resolvedPlayers: readonly PlayerId[],
): SelectorCardinalityPlayerResolvedEvalErrorContext {
  return {
    selectorKind: 'player',
    selector,
    resolvedCount: resolvedPlayers.length,
    resolvedPlayers,
  };
}

export function selectorCardinalityZoneResolvedContext(
  selector: ZoneSel,
  resolvedZones: readonly ZoneId[],
  deferClass?: EvalErrorDeferClass,
): SelectorCardinalityZoneEvalErrorContext {
  return {
    selectorKind: 'zone',
    selector,
    resolvedCount: resolvedZones.length,
    resolvedZones,
    ...(deferClass === undefined ? {} : { deferClass }),
  };
}

export function queryBoundsExceededError<
  T extends EvalErrorContextForCode<'QUERY_BOUNDS_EXCEEDED'> = EvalErrorContextForCode<'QUERY_BOUNDS_EXCEEDED'>,
>(
  message: string,
  context?: ExactEvalErrorContext<'QUERY_BOUNDS_EXCEEDED', T>,
): EvalError<'QUERY_BOUNDS_EXCEEDED'> {
  return createEvalError('QUERY_BOUNDS_EXCEEDED', message, context);
}

export function spatialNotImplementedError(
  message: string,
  context?: EvalErrorContextForCode<'SPATIAL_NOT_IMPLEMENTED'>,
): EvalError<'SPATIAL_NOT_IMPLEMENTED'> {
  return createEvalError('SPATIAL_NOT_IMPLEMENTED', message, context);
}

export function divisionByZeroError<
  T extends EvalErrorContextForCode<'DIVISION_BY_ZERO'> = EvalErrorContextForCode<'DIVISION_BY_ZERO'>,
>(
  message: string,
  context?: ExactEvalErrorContext<'DIVISION_BY_ZERO', T>,
): EvalError<'DIVISION_BY_ZERO'> {
  return createEvalError('DIVISION_BY_ZERO', message, context);
}

export function zonePropNotFoundError<
  T extends EvalErrorContextForCode<'ZONE_PROP_NOT_FOUND'> = EvalErrorContextForCode<'ZONE_PROP_NOT_FOUND'>,
>(
  message: string,
  context?: ExactEvalErrorContext<'ZONE_PROP_NOT_FOUND', T>,
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
