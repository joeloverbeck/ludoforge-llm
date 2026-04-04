import { getMaxQueryResults, type ReadContext } from './eval-context.js';
import { isRecoverableEvalResolutionError } from './eval-error-classification.js';
import { missingVarError, queryBoundsExceededError, typeMismatchError } from './eval-error.js';
import { evalCondition } from './eval-condition.js';
import { evalValue } from './eval-value.js';
import { shouldDeferFreeOperationZoneFilterFailure } from './missing-binding-policy.js';
import {
  collectFreeOperationZoneFilterProbeRebindableAliases,
  evaluateFreeOperationZoneFilterProbe,
} from './free-operation-zone-filter-probe.js';
import { resolveBindingTemplate } from './binding-template.js';
import { resolvePlayerSel } from './resolve-selectors.js';
import { resolveZoneRef } from './resolve-zone-ref.js';
import { asPlayerId, type PlayerId, type ZoneId } from './branded.js';
import { queryAdjacentZones, queryConnectedZones, queryTokensInAdjacentZones } from './spatial.js';
import { freeOperationZoneFilterEvaluationError } from './turn-flow-error.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import type { RuntimeTableKeyIndex } from './runtime-table-index.js';
import {
  runtimeTableCardinalityEvalError,
  runtimeTableContractMissingEvalError,
  runtimeTableFieldUndeclaredEvalError,
  runtimeTableIssueEvalError,
  runtimeTableRowsUnavailableEvalError,
} from './runtime-table-eval-errors.js';
import { filterRowsByPredicates, type ResolvedRowPredicate } from './query-predicate.js';
import { resolvePredicateValue } from './predicate-value-resolution.js';
import { resolveFreeOperationSequenceKey } from './free-operation-sequence-key.js';
import { isDynamicScopedVarNameExpr, resolveScopedVarNameExprValue } from './scoped-var-name-resolution.js';
import { filterTokensByExpr } from './token-filter.js';
import { planAssetRowsLookup } from './runtime-table-lookup-plan.js';
import { hasTokenRuntimeShapeKeys } from './token-shape.js';
import { getTokenStateIndex } from './token-state-index.js';
import { getZoneTokensByCanonicalId } from './runtime-zone-state.js';
import { internRuntimeZoneId } from './runtime-zone-index.js';
import { getZoneMap } from './def-lookup.js';
import type { AssetRowPredicate, NumericValueExpr, OptionsQuery, Token, TokenFilterExpr } from './types.js';

type AssetRow = Readonly<Record<string, unknown>>;
type QueryResult = Token | AssetRow | number | string | boolean | PlayerId | ZoneId;
type RuntimeQueryShape = 'token' | 'object' | 'number' | 'string' | 'boolean' | 'empty' | 'mixed';

function resolveIntDomainBound(bound: NumericValueExpr, ctx: ReadContext): number | null {
  let value: unknown;
  try {
    value = typeof bound === 'number' ? bound : evalValue(bound, ctx);
  } catch (error) {
    if (isRecoverableEvalResolutionError(error)) {
      return null;
    }
    throw error;
  }

  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return null;
  }
  return value;
}

function buildIntRangeCandidates(
  min: number,
  max: number,
  step: number,
  alwaysInclude: readonly number[],
): readonly number[] {
  const values = new Set<number>();
  for (let cursor = min; cursor <= max; cursor += step) {
    values.add(cursor);
  }
  values.add(min);
  values.add(max);
  for (const value of alwaysInclude) {
    if (value >= min && value <= max) {
      values.add(value);
    }
  }
  return [...values].sort((left, right) => left - right);
}

interface ResolvedIntRangeContract {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly alwaysInclude: ReadonlySet<number>;
}

function resolveIntRangeContract(
  min: number,
  max: number,
  controls: {
    readonly step?: NumericValueExpr;
    readonly alwaysInclude?: readonly NumericValueExpr[];
  },
  ctx: ReadContext,
): ResolvedIntRangeContract | null {
  if (min > max) {
    return null;
  }

  const step = controls.step === undefined ? 1 : resolveIntDomainBound(controls.step, ctx);
  if (step === null || step <= 0) {
    return null;
  }

  const alwaysInclude = new Set<number>();
  for (const entry of controls.alwaysInclude ?? []) {
    const value = resolveIntDomainBound(entry, ctx);
    if (value === null) {
      return null;
    }
    if (value >= min && value <= max) {
      alwaysInclude.add(value);
    }
  }

  return {
    min,
    max,
    step,
    alwaysInclude,
  };
}

function deterministicDownsample(
  candidates: readonly number[],
  required: ReadonlySet<number>,
  maxResults: number,
): readonly number[] {
  if (candidates.length <= maxResults) {
    return candidates;
  }

  const requiredValues = candidates.filter((value) => required.has(value));
  if (requiredValues.length > maxResults) {
    return [];
  }

  const optionalValues = candidates.filter((value) => !required.has(value));
  const optionalSlots = maxResults - requiredValues.length;
  if (optionalSlots <= 0) {
    return requiredValues;
  }
  if (optionalValues.length <= optionalSlots) {
    return [...requiredValues, ...optionalValues].sort((left, right) => left - right);
  }

  const stride = optionalValues.length / optionalSlots;
  const selected = new Set<number>();
  for (let index = 0; index < optionalSlots; index += 1) {
    const candidateIndex = Math.floor(index * stride);
    selected.add(optionalValues[Math.min(candidateIndex, optionalValues.length - 1)]!);
  }

  if (selected.size < optionalSlots) {
    for (const value of optionalValues) {
      if (selected.size >= optionalSlots) {
        break;
      }
      selected.add(value);
    }
  }

  return [...requiredValues, ...selected].sort((left, right) => left - right);
}

/**
 * Fast path for step=1 with maxResults << range size.
 * Computes the downsampled result directly in O(maxResults * required.length)
 * instead of O(range) by mapping optional indices to values mathematically.
 */
function directIntRangeDownsample(
  min: number,
  max: number,
  requiredSet: ReadonlySet<number>,
  maxResults: number,
): readonly number[] {
  const sortedRequired: number[] = [];
  for (const v of requiredSet) {
    if (v >= min && v <= max) sortedRequired.push(v);
  }
  sortedRequired.sort((a, b) => a - b);

  if (sortedRequired.length >= maxResults) {
    return sortedRequired.slice(0, maxResults);
  }

  const optionalSlots = maxResults - sortedRequired.length;
  const totalOptional = (max - min + 1) - sortedRequired.length;

  if (totalOptional <= optionalSlots) {
    // All values fit — build full range
    const result: number[] = [];
    for (let v = min; v <= max; v++) result.push(v);
    return result;
  }

  // Pick evenly-spaced optional values by index, adjusting for required gaps.
  const stride = totalOptional / optionalSlots;
  const resultSet = new Set(sortedRequired);
  for (let slot = 0; slot < optionalSlots; slot++) {
    const targetIdx = Math.floor(slot * stride);
    let candidate = min + targetIdx;
    for (const req of sortedRequired) {
      if (req <= candidate) candidate++;
      else break;
    }
    if (candidate >= min && candidate <= max) {
      resultSet.add(candidate);
    }
  }
  return [...resultSet].sort((a, b) => a - b);
}

function evaluateIntRangeDomain(
  min: number,
  max: number,
  controls: {
    readonly step?: NumericValueExpr;
    readonly alwaysInclude?: readonly NumericValueExpr[];
    readonly maxResults?: NumericValueExpr;
  },
  ctx: ReadContext,
): readonly number[] {
  const contract = resolveIntRangeContract(min, max, controls, ctx);
  if (contract === null) {
    return [];
  }

  let maxResults: number | undefined;
  if (controls.maxResults !== undefined) {
    const resolvedMaxResults = resolveIntDomainBound(controls.maxResults, ctx);
    if (resolvedMaxResults === null) {
      return [];
    }
    if (resolvedMaxResults < 1 || (min < max && resolvedMaxResults < 2)) {
      return [];
    }
    maxResults = resolvedMaxResults;
  }

  // Fast path: step=1 with maxResults — skip building the full range array.
  if (maxResults !== undefined && contract.step === 1) {
    const required = new Set([contract.min, contract.max, ...contract.alwaysInclude]);
    return directIntRangeDownsample(contract.min, contract.max, required, maxResults);
  }

  const alwaysInclude = [...contract.alwaysInclude];
  const candidates = buildIntRangeCandidates(contract.min, contract.max, contract.step, alwaysInclude);
  if (maxResults === undefined) {
    return candidates;
  }
  return deterministicDownsample(candidates, new Set([contract.min, contract.max, ...alwaysInclude]), maxResults);
}

function isWithinResolvedIntRangeDomain(
  selected: number,
  contract: ResolvedIntRangeContract,
): boolean {
  if (!Number.isSafeInteger(selected) || selected < contract.min || selected > contract.max) {
    return false;
  }
  if (selected === contract.min || selected === contract.max || contract.alwaysInclude.has(selected)) {
    return true;
  }
  return (selected - contract.min) % contract.step === 0;
}

function resolveDeclaredIntVarBounds(
  query: Extract<OptionsQuery, { readonly query: 'intsInVarRange' }>,
  ctx: ReadContext,
): { readonly min: number; readonly max: number } | null {
  const scope = query.scope ?? 'global';
  const resolvedVar = resolveScopedVarNameExprValue(query.var, ctx);
  if (typeof resolvedVar !== 'string') {
    if (isDynamicScopedVarNameExpr(query.var)) {
      if (query.var.ref === 'binding') {
        if (resolvedVar === undefined) {
          throw missingVarError(`intsInVarRange variable name binding not found: ${query.var.name}`, {
            query,
            binding: query.var.name,
            availableBindings: Object.keys(ctx.bindings).sort(),
          });
        }
        throw typeMismatchError(`intsInVarRange variable name binding must resolve to string: ${query.var.name}`, {
          query,
          binding: query.var.name,
          actualType: typeof resolvedVar,
          value: resolvedVar,
        });
      }
      if (resolvedVar === undefined) {
        throw missingVarError(`intsInVarRange variable name grantContext not found: ${query.var.key}`, {
          query,
          key: query.var.key,
          availableGrantContextKeys: Object.keys(ctx.freeOperationOverlay?.grantContext ?? {}).sort(),
        });
      }
      throw typeMismatchError(`intsInVarRange variable name grantContext must resolve to string: ${query.var.key}`, {
        query,
        key: query.var.key,
        actualType: typeof resolvedVar,
        value: resolvedVar,
      });
    }
    return null;
  }

  const declared =
    scope === 'global'
      ? ctx.def.globalVars.find((variable) => variable.name === resolvedVar)
      : ctx.def.perPlayerVars.find((variable) => variable.name === resolvedVar);
  if (declared === undefined) {
    if (isDynamicScopedVarNameExpr(query.var)) {
      throw missingVarError(
        `Unknown ${scope === 'global' ? 'global' : 'per-player'} variable for intsInVarRange: ${resolvedVar}`,
        {
          query,
          scope,
          var: resolvedVar,
          candidates: (scope === 'global' ? ctx.def.globalVars : ctx.def.perPlayerVars).map((variable) => variable.name).sort(),
        },
      );
    }
    return null;
  }
  if (declared.type !== 'int') {
    if (isDynamicScopedVarNameExpr(query.var)) {
      throw typeMismatchError(`intsInVarRange source variable must be int: ${resolvedVar}`, {
        query,
        scope,
        var: resolvedVar,
        actualType: declared.type,
      });
    }
    return null;
  }

  return {
    min: declared.min,
    max: declared.max,
  };
}

function assertWithinBounds(length: number, query: OptionsQuery, maxQueryResults: number): void {
  if (length > maxQueryResults) {
    throw queryBoundsExceededError('Query results exceed configured maxQueryResults', {
      query,
      maxQueryResults,
      resultLength: length,
    });
  }
}

function resolveGrantContextQuery(
  key: string,
  ctx: ReadContext,
): readonly (string | number | boolean)[] {
  const value = ctx.freeOperationOverlay?.grantContext?.[key];
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value as string | number | boolean];
}

function resolveCapturedSequenceZonesQuery(
  key: Extract<OptionsQuery, { readonly query: 'capturedSequenceZones' }>['key'],
  ctx: ReadContext,
): readonly string[] {
  const resolvedKey = resolveFreeOperationSequenceKey(key, ctx);
  return resolvedKey === undefined
    ? []
    : (ctx.freeOperationOverlay?.capturedSequenceZonesByKey?.[resolvedKey] ?? []);
}

function applyTokenFilter(tokens: readonly Token[], filter: TokenFilterExpr, ctx: ReadContext): readonly Token[] {
  const tokenStateIndex = getTokenStateIndex(ctx.state);
  const zoneDefById = getZoneMap(ctx.def);
  return filterTokensByExpr(
    tokens,
    filter,
    (value) => resolvePredicateValue(value, ctx),
    ctx.freeOperationOverlay,
    (token, predicate) => {
      const zoneId = tokenStateIndex.get(token.id)?.zoneId;
      if (predicate.field?.kind === 'tokenZone') {
        return zoneId;
      }
      if (predicate.field?.kind === 'zoneProp') {
        return zoneId === undefined ? undefined : Reflect.get(zoneDefById.get(zoneId as ZoneId) ?? {}, predicate.field.prop);
      }
      return undefined;
    },
  );
}

function resolveAssetRowPredicates(where: readonly AssetRowPredicate[], ctx: ReadContext): readonly ResolvedRowPredicate[] {
  return where.map((predicate) => ({
    field: predicate.field,
    op: predicate.op,
    value: resolvePredicateValue(predicate.value, ctx),
  }));
}

function extractOwnerQualifier(zoneId: ZoneId): string | null {
  const delimiter = zoneId.lastIndexOf(':');
  if (delimiter < 0 || delimiter === zoneId.length - 1) {
    return null;
  }

  return zoneId.slice(delimiter + 1);
}

type ZoneQueryFilter = Extract<OptionsQuery, { readonly query: 'zones' }>['filter'];

const evaluateFreeOperationZoneFilterForZone = (
  freeOperationZoneFilter: NonNullable<NonNullable<ReadContext['freeOperationOverlay']>['zoneFilter']>,
  rebindableAliases: ReadonlySet<string>,
  zoneId: ZoneId,
  ctx: ReadContext,
): boolean => {
  return evaluateFreeOperationZoneFilterProbe({
    zoneId,
    baseBindings: ctx.bindings,
    rebindableAliases,
    evaluateWithBindings: (bindings) => evalCondition(freeOperationZoneFilter, {
      ...ctx,
      bindings,
    }),
  });
};

function applyZonesFilter(
  zones: readonly { readonly id: ZoneId; readonly owner: 'none' | 'player' }[],
  queryFilter: ZoneQueryFilter,
  ctx: ReadContext,
): readonly ZoneId[] {
  let filteredZones = [...zones];
  const queryCondition = queryFilter?.condition;
  const freeOperationZoneFilter = ctx.freeOperationOverlay?.zoneFilter;

  if (queryFilter?.owner !== undefined) {
    const owners = new Set(resolvePlayerSel(queryFilter.owner, ctx));
    filteredZones = filteredZones.filter((zone) => {
      if (zone.owner !== 'player') {
        return false;
      }

      const ownerQualifier = extractOwnerQualifier(zone.id);
      if (ownerQualifier === null || !/^[0-9]+$/.test(ownerQualifier)) {
        return false;
      }

      const playerId = asPlayerId(Number(ownerQualifier));
      return owners.has(playerId);
    });
  }

  if (queryCondition !== undefined) {
    filteredZones = filteredZones.filter((zone) => {
      return evalCondition(queryCondition, {
        ...ctx,
        bindings: {
          ...ctx.bindings,
          $zone: zone.id,
        },
      });
    });
  }

  if (freeOperationZoneFilter !== undefined) {
    const rebindableAliases = collectFreeOperationZoneFilterProbeRebindableAliases(freeOperationZoneFilter);
    filteredZones = filteredZones.filter((zone) => {
      try {
        return evaluateFreeOperationZoneFilterForZone(freeOperationZoneFilter, rebindableAliases, zone.id, ctx);
      } catch (cause) {
        const diagnostics = ctx.freeOperationOverlay?.zoneFilterDiagnostics;
        if (diagnostics !== undefined) {
          if (shouldDeferFreeOperationZoneFilterFailure(diagnostics.source, cause)) {
            return true;
          }
          throw freeOperationZoneFilterEvaluationError({
            surface: diagnostics.source,
            actionId: diagnostics.actionId,
            moveParams: diagnostics.moveParams,
            zoneFilter: freeOperationZoneFilter,
            candidateZone: zone.id,
            cause,
          });
        }
        throw cause;
      }
    });
  }

  return filteredZones.map((zone) => zone.id);
}

function evalZonesQuery(query: Extract<OptionsQuery, { readonly query: 'zones' }>, ctx: ReadContext): readonly ZoneId[] {
  const allZones = [...ctx.def.zones].sort((left, right) => left.id.localeCompare(right.id));
  return applyZonesFilter(allZones, query.filter, ctx);
}

function evalMapSpacesQuery(
  query: Extract<OptionsQuery, { readonly query: 'mapSpaces' }>,
  ctx: ReadContext,
): readonly ZoneId[] {
  const mapSpaceZones = [...ctx.def.zones]
    .filter((zone) => zone.zoneKind === 'board')
    .sort((left, right) => {
      const zoneRuntimeIndex = ctx.adjacencyGraph.zoneRuntimeIndex;
      const leftRuntimeId = internRuntimeZoneId(left.id, zoneRuntimeIndex);
      const rightRuntimeId = internRuntimeZoneId(right.id, zoneRuntimeIndex);
      if (leftRuntimeId === undefined || rightRuntimeId === undefined) {
        return left.id.localeCompare(right.id);
      }
      return leftRuntimeId - rightRuntimeId;
    });
  return applyZonesFilter(mapSpaceZones, query.filter, ctx);
}

function evalTokensInMapSpacesQuery(
  query: Extract<OptionsQuery, { readonly query: 'tokensInMapSpaces' }>,
  ctx: ReadContext,
): readonly Token[] {
  const mapSpaceZones = [...ctx.def.zones]
    .filter((zone) => zone.zoneKind === 'board')
    .sort((left, right) => {
      const zoneRuntimeIndex = ctx.adjacencyGraph.zoneRuntimeIndex;
      const leftRuntimeId = internRuntimeZoneId(left.id, zoneRuntimeIndex);
      const rightRuntimeId = internRuntimeZoneId(right.id, zoneRuntimeIndex);
      if (leftRuntimeId === undefined || rightRuntimeId === undefined) {
        return left.id.localeCompare(right.id);
      }
      return leftRuntimeId - rightRuntimeId;
    });
  const selectedZones = applyZonesFilter(mapSpaceZones, query.spaceFilter, ctx);
  const zoneTokens = selectedZones.flatMap((zoneId) => [
    ...(getZoneTokensByCanonicalId(ctx.state, zoneId, ctx.adjacencyGraph.zoneRuntimeIndex) ?? []),
  ]);
  return query.filter !== undefined ? applyTokenFilter(zoneTokens, query.filter, ctx) : zoneTokens;
}

function deepEqualUnknown(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!deepEqualUnknown(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false;
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index]) {
      return false;
    }
  }

  for (const key of leftKeys) {
    if (!deepEqualUnknown((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

function queryItemsEqual(left: QueryResult, right: unknown): boolean {
  return deepEqualUnknown(left, right);
}

function normalizeOrderIndex(index: number, length: number): number {
  const remainder = index % length;
  return remainder >= 0 ? remainder : remainder + length;
}

function evalNextInOrderByConditionQuery(
  query: Extract<OptionsQuery, { readonly query: 'nextInOrderByCondition' }>,
  ctx: ReadContext,
): readonly QueryResult[] {
  const sourceOrder = evalQuery(query.source, ctx);
  if (sourceOrder.length === 0) {
    return [];
  }

  let anchor: unknown;
  try {
    anchor = evalValue(query.from, ctx);
  } catch (error) {
    if (isRecoverableEvalResolutionError(error)) {
      return [];
    }
    throw error;
  }
  // Contract: duplicate anchors resolve to the first matching source index.
  const anchorIndex = sourceOrder.findIndex((candidate) => queryItemsEqual(candidate, anchor));
  if (anchorIndex < 0) {
    return [];
  }

  const startOffset = query.includeFrom === true ? 0 : 1;
  for (let offset = 0; offset < sourceOrder.length; offset += 1) {
    const candidate = sourceOrder[normalizeOrderIndex(anchorIndex + startOffset + offset, sourceOrder.length)]!;
    const matches = evalCondition(query.where, {
      ...ctx,
      bindings: {
        ...ctx.bindings,
        [query.bind]: candidate,
      },
    });
    if (matches) {
      return [candidate];
    }
  }

  return [];
}

function dedupeStringsPreserveOrder(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function classifyResultItem(item: QueryResult): Exclude<RuntimeQueryShape, 'empty' | 'mixed'> {
  if (typeof item === 'number') {
    return 'number';
  }
  if (typeof item === 'string') {
    return 'string';
  }
  if (typeof item === 'boolean') {
    return 'boolean';
  }
  if (hasTokenRuntimeShapeKeys(item)) {
    return 'token';
  }
  return 'object';
}

function classifyQueryResults(items: readonly QueryResult[]): RuntimeQueryShape {
  if (items.length === 0) {
    return 'empty';
  }

  let expected: Exclude<RuntimeQueryShape, 'empty' | 'mixed'> | null = null;
  for (const item of items) {
    const shape = classifyResultItem(item);
    if (expected === null) {
      expected = shape;
      continue;
    }
    if (shape !== expected) {
      return 'mixed';
    }
  }

  return expected ?? 'empty';
}

function resolveRuntimeTableRows(query: Extract<OptionsQuery, { readonly query: 'assetRows' }>, ctx: ReadContext): {
  readonly rows: readonly AssetRow[];
  readonly fieldNames: ReadonlySet<string>;
  readonly keyIndexesByTuple: ReadonlyMap<string, RuntimeTableKeyIndex>;
} {
  const index = ctx.runtimeTableIndex ?? buildRuntimeTableIndex(ctx.def);
  const entry = index.tablesById.get(query.tableId);
  if (entry === undefined) {
    throw runtimeTableContractMissingEvalError({ query }, query.tableId, index.tableIds);
  }

  if (entry.issue !== undefined) {
    throw runtimeTableIssueEvalError(
      { query },
      query.tableId,
      entry.contract,
      entry.issue,
      (ctx.def.runtimeDataAssets ?? []).map((candidate) => candidate.id).sort((left, right) => left.localeCompare(right)),
    );
  }
  if (entry.rows === null) {
    throw runtimeTableRowsUnavailableEvalError({ query }, query.tableId);
  }

  return {
    rows: entry.rows,
    fieldNames: entry.fieldNames,
    keyIndexesByTuple: entry.keyIndexesByTuple,
  };
}

function evalAssetRowsQuery(
  query: Extract<OptionsQuery, { readonly query: 'assetRows' }>,
  ctx: ReadContext,
): readonly AssetRow[] {
  const resolved = resolveRuntimeTableRows(query, ctx);
  const rows = resolved.rows;
  const wherePredicates = query.where ?? [];
  let matchedRows = rows;
  if (wherePredicates.length > 0) {
    for (const predicate of wherePredicates) {
      if (!resolved.fieldNames.has(predicate.field)) {
        throw runtimeTableFieldUndeclaredEvalError(
          { query },
          query.tableId,
          predicate.field,
          [...resolved.fieldNames].sort((left, right) => left.localeCompare(right)),
        );
      }
    }

    const resolvedPredicates = resolveAssetRowPredicates(wherePredicates, ctx);
    const lookupPlan = planAssetRowsLookup(resolvedPredicates, resolved.keyIndexesByTuple, rows);
    const predicateRows = lookupPlan.candidates;
    matchedRows = filterRowsByPredicates(predicateRows, resolvedPredicates, {
      getFieldValue: (row, field) => row[field],
      context: (predicate, row) => ({
        domain: 'assetRow',
        query,
        predicate,
        availableFields: Object.keys(row).sort(),
      }),
    });
  }

  const cardinality = query.cardinality ?? 'many';
  if (cardinality === 'exactlyOne' && matchedRows.length !== 1) {
    throw runtimeTableCardinalityEvalError({ query }, query.tableId, cardinality, matchedRows.length, query.where ?? []);
  }
  if (cardinality === 'zeroOrOne' && matchedRows.length > 1) {
    throw runtimeTableCardinalityEvalError({ query }, query.tableId, cardinality, matchedRows.length, query.where ?? []);
  }

  return matchedRows;
}

function evalHomogeneousRecursiveQuery(
  query: Extract<OptionsQuery, { readonly query: 'concat' | 'prioritized' }>,
  children: readonly OptionsQuery[],
  ctx: ReadContext,
  labels: {
    readonly child: 'source' | 'tier';
    readonly children: 'sources' | 'tiers';
  },
): readonly QueryResult[] {
  const combined: QueryResult[] = [];
  let expectedShape: Exclude<RuntimeQueryShape, 'empty' | 'mixed'> | null = null;

  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const child = children[childIndex]!;
    const childItems = evalQuery(child, ctx);
    const childShape = classifyQueryResults(childItems);
    if (childShape === 'mixed') {
      throw typeMismatchError(`${query.query} ${labels.child} produced mixed item shapes`, {
        query,
        [`${labels.child}Index`]: childIndex,
        [labels.child]: child,
      });
    }
    if (childShape !== 'empty') {
      if (expectedShape === null) {
        expectedShape = childShape;
      } else if (childShape !== expectedShape) {
        throw typeMismatchError(`${query.query} ${labels.children} must produce a single runtime item shape`, {
          query,
          [`${labels.child}Index`]: childIndex,
          [labels.child]: child,
          expectedShape,
          actualShape: childShape,
        });
      }
    }
    combined.push(...childItems);
  }

  assertWithinBounds(combined.length, query, getMaxQueryResults(ctx));
  return combined;
}

export function evalQuery(query: OptionsQuery, ctx: ReadContext): readonly QueryResult[] {
  const maxQueryResults = getMaxQueryResults(ctx);

  switch (query.query) {
    case 'concat':
      return evalHomogeneousRecursiveQuery(query, query.sources, ctx, { child: 'source', children: 'sources' });
    case 'prioritized':
      return evalHomogeneousRecursiveQuery(query, query.tiers, ctx, { child: 'tier', children: 'tiers' });
    case 'tokenZones': {
      const sourceItems = evalQuery(query.source, ctx);
      const tokenStateIndex = getTokenStateIndex(ctx.state);
      const knownTokenIds = new Set(tokenStateIndex.keys());

      const zones = sourceItems.map((item) => {
        let tokenId: string | null = null;
        if (hasTokenRuntimeShapeKeys(item)) {
          const candidateId = item.id;
          const candidateType = item.type;
          if (typeof candidateId === 'string' && typeof candidateType === 'string') {
            tokenId = candidateId;
          }
        } else if (typeof item === 'string' && knownTokenIds.has(item)) {
          tokenId = item;
        }
        if (tokenId === null) {
          throw typeMismatchError('tokenZones source must produce tokens or token ids that exist in state', {
            query,
            source: query.source,
            item,
            itemType: typeof item,
          });
        }
        const tokenState = tokenStateIndex.get(tokenId);
        if (tokenState !== undefined) {
          return tokenState.zoneId;
        }
        throw missingVarError(`Token ${tokenId} not found in any zone`, {
          query,
          tokenId,
          availableZoneIds: Object.keys(ctx.state.zones).sort(),
        });
      });
      const dedupe = query.dedupe ?? true;
      const normalized = dedupe ? dedupeStringsPreserveOrder(zones) : zones;
      assertWithinBounds(normalized.length, query, maxQueryResults);
      return normalized;
    }
    case 'tokensInZone': {
      const zoneId = resolveZoneRef(query.zone, ctx);
      const zoneTokens = getZoneTokensByCanonicalId(ctx.state, zoneId, ctx.adjacencyGraph.zoneRuntimeIndex);
      if (zoneTokens === undefined) {
        throw missingVarError(`Zone state not found for selector result: ${zoneId}`, {
          query,
          zoneId,
          availableZoneIds: Object.keys(ctx.state.zones).sort(),
        });
      }

      const filtered = query.filter !== undefined ? applyTokenFilter(zoneTokens, query.filter, ctx) : [...zoneTokens];
      assertWithinBounds(filtered.length, query, maxQueryResults);
      return filtered;
    }
    case 'assetRows': {
      const rows = evalAssetRowsQuery(query, ctx);
      assertWithinBounds(rows.length, query, maxQueryResults);
      return rows;
    }

    case 'tokensInMapSpaces': {
      const filtered = evalTokensInMapSpacesQuery(query, ctx);
      assertWithinBounds(filtered.length, query, maxQueryResults);
      return filtered;
    }

    case 'nextInOrderByCondition': {
      const nextResult = evalNextInOrderByConditionQuery(query, ctx);
      assertWithinBounds(nextResult.length, query, maxQueryResults);
      return nextResult;
    }

    case 'intsInRange': {
      const min = resolveIntDomainBound(query.min, ctx);
      const max = resolveIntDomainBound(query.max, ctx);
      if (min === null || max === null || min > max) {
        return [];
      }
      const bounded = evaluateIntRangeDomain(min, max, query, ctx);

      assertWithinBounds(bounded.length, query, maxQueryResults);
      return bounded;
    }

    case 'intsInVarRange': {
      const declaredBounds = resolveDeclaredIntVarBounds(query, ctx);
      if (declaredBounds === null) {
        return [];
      }

      const derivedMin =
        query.min === undefined ? declaredBounds.min : resolveIntDomainBound(query.min, ctx);
      const derivedMax =
        query.max === undefined ? declaredBounds.max : resolveIntDomainBound(query.max, ctx);
      if (derivedMin === null || derivedMax === null) {
        return [];
      }

      const min = Math.max(declaredBounds.min, derivedMin);
      const max = Math.min(declaredBounds.max, derivedMax);
      const bounded = evaluateIntRangeDomain(min, max, query, ctx);
      assertWithinBounds(bounded.length, query, maxQueryResults);
      return bounded;
    }

    case 'enums': {
      assertWithinBounds(query.values.length, query, maxQueryResults);
      return [...query.values];
    }

    case 'globalMarkers': {
      const allMarkers = (ctx.def.globalMarkerLattices ?? []).map((lattice) => lattice.id);
      const markerOrder = query.markers === undefined ? [...allMarkers].sort() : dedupeStringsPreserveOrder(query.markers);
      const allowedStates = query.states === undefined ? null : new Set(query.states);
      const filtered = markerOrder.filter((markerId) => {
        const lattice = ctx.def.globalMarkerLattices?.find((entry) => entry.id === markerId);
        if (lattice === undefined) {
          return false;
        }
        if (allowedStates === null) {
          return true;
        }
        const currentState = ctx.state.globalMarkers?.[markerId] ?? lattice.defaultState;
        return allowedStates.has(currentState);
      });
      assertWithinBounds(filtered.length, query, maxQueryResults);
      return filtered;
    }

    case 'players': {
      const players = resolvePlayerSel('all', ctx);
      assertWithinBounds(players.length, query, maxQueryResults);
      return players;
    }

    case 'zones': {
      const zones = evalZonesQuery(query, ctx);
      assertWithinBounds(zones.length, query, maxQueryResults);
      return zones;
    }

    case 'mapSpaces': {
      const mapSpaces = evalMapSpacesQuery(query, ctx);
      assertWithinBounds(mapSpaces.length, query, maxQueryResults);
      return mapSpaces;
    }

    case 'adjacentZones': {
      const zoneId = resolveZoneRef(query.zone, ctx);
      const zones = queryAdjacentZones(ctx.adjacencyGraph, zoneId);
      assertWithinBounds(zones.length, query, maxQueryResults);
      return zones;
    }

    case 'tokensInAdjacentZones': {
      const zoneId = resolveZoneRef(query.zone, ctx);
      const tokens = queryTokensInAdjacentZones(ctx.adjacencyGraph, ctx.state, zoneId);
      const filtered = query.filter !== undefined ? applyTokenFilter(tokens, query.filter, ctx) : tokens;
      assertWithinBounds(filtered.length, query, maxQueryResults);
      return filtered;
    }

    case 'connectedZones': {
      const zoneId = resolveZoneRef(query.zone, ctx);
      const options =
        query.includeStart === undefined && query.allowTargetOutsideVia === undefined && query.maxDepth === undefined
          ? undefined
          : {
              ...(query.includeStart === undefined ? {} : { includeStart: query.includeStart }),
              ...(query.allowTargetOutsideVia === undefined ? {} : { allowTargetOutsideVia: query.allowTargetOutsideVia }),
              ...(query.maxDepth === undefined ? {} : { maxDepth: query.maxDepth }),
            };
      const zones = queryConnectedZones(ctx.adjacencyGraph, ctx.state, zoneId, ctx, query.via, {
        ...options,
      });
      assertWithinBounds(zones.length, query, maxQueryResults);
      return zones;
    }

    case 'binding': {
      const bindings = ctx.bindings;
      const resolvedName = resolveBindingTemplate(query.name, bindings);
      const boundValue = bindings[resolvedName];
      if (boundValue === undefined) {
        throw missingVarError(`Binding not found: ${resolvedName}`, {
          query,
          binding: resolvedName,
          bindingTemplate: query.name,
          availableBindings: Object.keys(bindings).sort(),
        });
      }

      if (!Array.isArray(boundValue)) {
        throw missingVarError(`Binding query requires an array value, got ${typeof boundValue}: ${resolvedName}`, {
          query,
          binding: resolvedName,
          bindingTemplate: query.name,
          actualType: typeof boundValue,
        });
      }

      assertWithinBounds(boundValue.length, query, maxQueryResults);
      return boundValue as readonly QueryResult[];
    }

    case 'grantContext': {
      const values = resolveGrantContextQuery(query.key, ctx);
      assertWithinBounds(values.length, query, maxQueryResults);
      return values;
    }

    case 'capturedSequenceZones': {
      const values = resolveCapturedSequenceZonesQuery(query.key, ctx);
      assertWithinBounds(values.length, query, maxQueryResults);
      return values;
    }

    default: {
      const _exhaustive: never = query;
      return _exhaustive;
    }
  }
}

export function isInIntRangeDomain(
  query: Extract<OptionsQuery, { readonly query: 'intsInRange' | 'intsInVarRange' }>,
  selected: unknown,
  ctx: ReadContext,
): boolean {
  if (typeof selected !== 'number' || !Number.isSafeInteger(selected)) {
    return false;
  }

  if (query.query === 'intsInRange') {
    const min = resolveIntDomainBound(query.min, ctx);
    const max = resolveIntDomainBound(query.max, ctx);
    if (min === null || max === null) {
      return false;
    }
    const contract = resolveIntRangeContract(min, max, query, ctx);
    if (contract === null) {
      return false;
    }
    return isWithinResolvedIntRangeDomain(selected, contract);
  }

  const declaredBounds = resolveDeclaredIntVarBounds(query, ctx);
  if (declaredBounds === null) {
    return false;
  }
  const derivedMin = query.min === undefined ? declaredBounds.min : resolveIntDomainBound(query.min, ctx);
  const derivedMax = query.max === undefined ? declaredBounds.max : resolveIntDomainBound(query.max, ctx);
  if (derivedMin === null || derivedMax === null) {
    return false;
  }
  const min = Math.max(declaredBounds.min, derivedMin);
  const max = Math.min(declaredBounds.max, derivedMax);
  const contract = resolveIntRangeContract(min, max, query, ctx);
  if (contract === null) {
    return false;
  }
  return isWithinResolvedIntRangeDomain(selected, contract);
}
