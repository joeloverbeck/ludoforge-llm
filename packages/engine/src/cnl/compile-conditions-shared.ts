import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  AssetRowPredicate,
  ConditionAST,
  FreeOperationSequenceKeyExpr,
  NumericValueExpr,
  OptionsQuery,
  ScopedVarNameExpr,
  TokenFilterExpr,
  ValueExpr,
  ZoneRef,
} from '../kernel/types.js';
import { isMembershipScalar } from '../kernel/value-membership.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import { canonicalizeZoneSelector } from './compile-zones.js';
import type { CanonicalNamedSets } from './named-set-utils.js';
import type { TypeInferenceContext } from './type-inference.js';

export type ZoneOwnershipKind = 'none' | 'player' | 'mixed';

export interface ConditionLoweringContext {
  readonly ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>;
  readonly zoneIdSet?: ReadonlySet<string>;
  readonly bindingScope?: readonly string[];
  readonly tokenTraitVocabulary?: Readonly<Record<string, readonly string[]>>;
  readonly tokenFilterProps?: readonly string[];
  readonly namedSets?: CanonicalNamedSets;
  readonly typeInference?: TypeInferenceContext;
  readonly seatIds?: readonly string[];
}

export interface ConditionLoweringResult<TValue> {
  readonly value: TValue | null;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ConditionLoweringRuntime {
  lowerConditionNode(source: unknown, context: ConditionLoweringContext, path: string): ConditionLoweringResult<ConditionAST>;
  lowerValueNode(source: unknown, context: ConditionLoweringContext, path: string): ConditionLoweringResult<ValueExpr>;
  lowerNumericValueNode(source: unknown, context: ConditionLoweringContext, path: string): ConditionLoweringResult<NumericValueExpr>;
  lowerScopedVarNameExpr(source: unknown, path: string): ConditionLoweringResult<ScopedVarNameExpr>;
  lowerTokenFilterExpr(source: unknown, context: ConditionLoweringContext, path: string): ConditionLoweringResult<TokenFilterExpr>;
  lowerQueryNode(source: unknown, context: ConditionLoweringContext, path: string): ConditionLoweringResult<OptionsQuery>;
  lowerZoneRef(source: unknown, context: ConditionLoweringContext, path: string): ConditionLoweringResult<ZoneRef>;
  lowerFreeOperationSequenceKeyExpr(source: unknown, path: string): ConditionLoweringResult<FreeOperationSequenceKeyExpr>;
  lowerAssetRowFilterArray(
    source: readonly unknown[],
    context: ConditionLoweringContext,
    path: string,
  ): ConditionLoweringResult<readonly AssetRowPredicate[]>;
}

export const SUPPORTED_QUERY_KINDS = [
  'concat',
  'prioritized',
  'tokenZones',
  'tokensInZone',
  'assetRows',
  'tokensInMapSpaces',
  'nextInOrderByCondition',
  'intsInRange',
  'intsInVarRange',
  'enums',
  'globalMarkers',
  'players',
  'zones',
  'mapSpaces',
  'adjacentZones',
  'tokensInAdjacentZones',
  'connectedZones',
  'binding',
  'grantContext',
  'capturedSequenceZones',
] as const;

export const SUPPORTED_REFERENCE_KINDS = [
  'gvar',
  'pvar',
  'zoneCount',
  'tokenProp',
  'assetField',
  'binding',
  'markerState',
  'globalMarkerState',
  'tokenZone',
  'zoneProp',
  'zoneVar',
  'activePlayer',
  'activeSeat',
  'grantContext',
  'capturedSequenceZones',
] as const;

export const PREDICATE_ALIAS_KEYS = Object.freeze({
  eq: true,
  neq: true,
  in: true,
  notIn: true,
} as const);

export function lowerBooleanArityTuple<TValue>(
  source: { readonly op: 'and' | 'or'; readonly args?: unknown },
  path: string,
  kind: string,
  alternatives: readonly string[],
  lowerArgs: (args: readonly unknown[]) => ConditionLoweringResult<readonly TValue[]>,
): ConditionLoweringResult<readonly [TValue, ...TValue[]]> {
  if (!Array.isArray(source.args) || source.args.length === 0) {
    return missingCapability(path, kind, source, alternatives);
  }
  const loweredArgs = lowerArgs(source.args);
  if (loweredArgs.value === null) {
    return { value: null, diagnostics: loweredArgs.diagnostics };
  }
  if (loweredArgs.value.length === 0) {
    return missingCapability(path, kind, source, alternatives);
  }
  const [first, ...rest] = loweredArgs.value;
  return {
    value: [first!, ...rest],
    diagnostics: loweredArgs.diagnostics,
  };
}

export function lowerZoneSelector(
  source: unknown,
  context: ConditionLoweringContext,
  path: string,
): ConditionLoweringResult<string> {
  const zone = canonicalizeZoneSelector(source, context.ownershipByBase, path, context.seatIds, context.zoneIdSet);
  if (zone.value === null) {
    return { value: null, diagnostics: zone.diagnostics };
  }
  return {
    value: zone.value,
    diagnostics: zone.diagnostics,
  };
}

export function lowerScalarMembershipLiteral(
  source: readonly unknown[],
  path: string,
  kind: string,
  alternatives: readonly string[],
): ConditionLoweringResult<readonly (string | number | boolean)[]> {
  const values: Array<string | number | boolean> = [];
  let scalarType: 'string' | 'number' | 'boolean' | null = null;

  for (const entry of source) {
    if (!isMembershipScalar(entry)) {
      return missingCapability(path, kind, source, alternatives);
    }
    const entryType = typeof entry as 'string' | 'number' | 'boolean';
    if (scalarType !== null && entryType !== scalarType) {
      return missingCapability(path, kind, source, alternatives);
    }
    scalarType ??= entryType;
    values.push(entry);
  }

  return { value: values, diagnostics: [] };
}

export function rejectPredicateAliasKeysWhenCanonicalShapePresent(
  source: Record<string, unknown>,
  path: string,
  construct: string,
  canonicalAlternative: string,
): ConditionLoweringResult<never> | null {
  if (!Object.prototype.hasOwnProperty.call(source, 'op') || !Object.prototype.hasOwnProperty.call(source, 'value')) {
    return null;
  }
  if (!Object.keys(PREDICATE_ALIAS_KEYS).some((key) => Object.prototype.hasOwnProperty.call(source, key))) {
    return null;
  }
  return missingCapability(path, construct, source, [canonicalAlternative]);
}

export function missingCapability<TValue>(
  path: string,
  construct: string,
  actual: unknown,
  alternatives?: readonly string[],
): ConditionLoweringResult<TValue> {
  return {
    value: null,
    diagnostics: [
      {
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
        path,
        severity: 'error',
        message: `Cannot lower ${construct} to kernel AST: ${formatValue(actual)}.`,
        suggestion: 'Rewrite this node to a supported kernel-compatible shape.',
        ...(alternatives === undefined ? {} : { alternatives: [...alternatives] }),
      },
    ],
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
