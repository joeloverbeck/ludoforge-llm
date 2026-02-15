import { getMaxQueryResults, type EvalContext } from './eval-context.js';
import { isEvalErrorCode, missingVarError, queryBoundsExceededError } from './eval-error.js';
import { evalCondition } from './eval-condition.js';
import { evalValue } from './eval-value.js';
import { emitWarning } from './execution-collector.js';
import { resolveBindingTemplate } from './binding-template.js';
import { resolvePlayerSel, resolveSingleZoneSel } from './resolve-selectors.js';
import { asPlayerId, type PlayerId, type ZoneId } from './branded.js';
import { queryAdjacentZones, queryConnectedZones, queryTokensInAdjacentZones } from './spatial.js';
import { freeOperationZoneFilterEvaluationError } from './turn-flow-error.js';
import type { NumericValueExpr, OptionsQuery, Token, TokenFilterPredicate, ValueExpr } from './types.js';

type QueryResult = Token | number | string | PlayerId | ZoneId;

function resolveIntDomainBound(bound: NumericValueExpr, ctx: EvalContext): number | null {
  let value: number | boolean | string;
  try {
    value = typeof bound === 'number' ? bound : evalValue(bound, ctx);
  } catch (error) {
    if (isEvalErrorCode(error, 'DIVISION_BY_ZERO') || isEvalErrorCode(error, 'MISSING_BINDING') || isEvalErrorCode(error, 'MISSING_VAR')) {
      return null;
    }
    throw error;
  }

  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return null;
  }
  return value;
}

function resolveDeclaredIntVarBounds(
  query: Extract<OptionsQuery, { readonly query: 'intsInVarRange' }>,
  ctx: EvalContext,
): { readonly min: number; readonly max: number } | null {
  const scope = query.scope ?? 'global';
  const declared =
    scope === 'global'
      ? ctx.def.globalVars.find((variable) => variable.name === query.var)
      : ctx.def.perPlayerVars.find((variable) => variable.name === query.var);
  if (declared === undefined || declared.type !== 'int') {
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

function resolveFilterValue(value: TokenFilterPredicate['value'], ctx: EvalContext): string | number | boolean | readonly string[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return evalValue(value as ValueExpr, ctx);
}

function tokenFilterFieldValue(token: Token, field: string): string | number | boolean | undefined {
  if (field === 'id') {
    return token.id;
  }
  return token.props[field];
}

function tokenMatchesPredicate(token: Token, predicate: TokenFilterPredicate, ctx: EvalContext): boolean {
  const propValue = tokenFilterFieldValue(token, predicate.prop);
  if (propValue === undefined) {
    return false;
  }

  const resolved = resolveFilterValue(predicate.value, ctx);

  switch (predicate.op) {
    case 'eq':
      return propValue === resolved;
    case 'neq':
      return propValue !== resolved;
    case 'in':
      return Array.isArray(resolved) && resolved.includes(String(propValue));
    case 'notIn':
      return Array.isArray(resolved) && !resolved.includes(String(propValue));
    default: {
      const _exhaustive: never = predicate.op;
      return _exhaustive;
    }
  }
}

function applyTokenFilters(tokens: readonly Token[], filters: readonly TokenFilterPredicate[], ctx: EvalContext): readonly Token[] {
  if (filters.length === 0) {
    return [...tokens];
  }

  return tokens.filter((token) => filters.every((predicate) => tokenMatchesPredicate(token, predicate, ctx)));
}

function extractOwnerQualifier(zoneId: ZoneId): string | null {
  const delimiter = zoneId.lastIndexOf(':');
  if (delimiter < 0 || delimiter === zoneId.length - 1) {
    return null;
  }

  return zoneId.slice(delimiter + 1);
}

type ZoneQueryFilter = Extract<OptionsQuery, { readonly query: 'zones' }>['filter'];

function applyZonesFilter(
  zones: readonly { readonly id: ZoneId; readonly owner: 'none' | 'player' }[],
  queryFilter: ZoneQueryFilter,
  ctx: EvalContext,
): readonly ZoneId[] {
  let filteredZones = [...zones];
  const queryCondition = queryFilter?.condition;
  const freeOperationZoneFilter = ctx.freeOperationZoneFilter;

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
    filteredZones = filteredZones.filter((zone) => {
      try {
        return evalCondition(freeOperationZoneFilter, {
          ...ctx,
          bindings: {
            ...ctx.bindings,
            $zone: zone.id,
          },
        });
      } catch (cause) {
        const diagnostics = ctx.freeOperationZoneFilterDiagnostics;
        if (diagnostics !== undefined) {
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

function evalZonesQuery(query: Extract<OptionsQuery, { readonly query: 'zones' }>, ctx: EvalContext): readonly ZoneId[] {
  const allZones = [...ctx.def.zones].sort((left, right) => left.id.localeCompare(right.id));
  return applyZonesFilter(allZones, query.filter, ctx);
}

function evalMapSpacesQuery(
  query: Extract<OptionsQuery, { readonly query: 'mapSpaces' }>,
  ctx: EvalContext,
): readonly ZoneId[] {
  const mapSpaceIds = new Set((ctx.mapSpaces ?? []).map((space) => space.id));
  const mapSpaceZones = [...ctx.def.zones]
    .filter((zone) => mapSpaceIds.has(zone.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  return applyZonesFilter(mapSpaceZones, query.filter, ctx);
}

function evalTokensInMapSpacesQuery(
  query: Extract<OptionsQuery, { readonly query: 'tokensInMapSpaces' }>,
  ctx: EvalContext,
): readonly Token[] {
  const mapSpaceIds = new Set((ctx.mapSpaces ?? []).map((space) => space.id));
  const mapSpaceZones = [...ctx.def.zones]
    .filter((zone) => mapSpaceIds.has(zone.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const selectedZones = applyZonesFilter(mapSpaceZones, query.spaceFilter, ctx);
  const zoneTokens = selectedZones.flatMap((zoneId) => [...(ctx.state.zones[String(zoneId)] ?? [])]);
  return query.filter !== undefined ? applyTokenFilters(zoneTokens, query.filter, ctx) : zoneTokens;
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

export function evalQuery(query: OptionsQuery, ctx: EvalContext): readonly QueryResult[] {
  const maxQueryResults = getMaxQueryResults(ctx);

  switch (query.query) {
    case 'tokensInZone': {
      const zoneId = resolveSingleZoneSel(query.zone, ctx);
      const zoneTokens = ctx.state.zones[String(zoneId)];
      if (zoneTokens === undefined) {
        throw missingVarError(`Zone state not found for selector result: ${zoneId}`, {
          query,
          zoneId,
          availableZoneIds: Object.keys(ctx.state.zones).sort(),
        });
      }

      const filtered = query.filter !== undefined ? applyTokenFilters(zoneTokens, query.filter, ctx) : [...zoneTokens];
      if (filtered.length === 0 && zoneTokens.length > 0 && query.filter !== undefined && query.filter.length > 0) {
        emitWarning(ctx.collector, {
          code: 'EMPTY_QUERY_RESULT',
          message: `tokensInZone in ${zoneId} matched 0 of ${zoneTokens.length} tokens after filtering`,
          context: { zone: zoneId, totalTokens: zoneTokens.length, filterCount: query.filter.length },
          hint: 'enable trace:true to see filter predicates vs token props',
        });
      }
      assertWithinBounds(filtered.length, query, maxQueryResults);
      return filtered;
    }

    case 'tokensInMapSpaces': {
      const filtered = evalTokensInMapSpacesQuery(query, ctx);
      assertWithinBounds(filtered.length, query, maxQueryResults);
      return filtered;
    }

    case 'intsInRange': {
      const min = resolveIntDomainBound(query.min, ctx);
      const max = resolveIntDomainBound(query.max, ctx);
      if (min === null || max === null || min > max) {
        return [];
      }

      const rangeLength = max - min + 1;
      assertWithinBounds(rangeLength, query, maxQueryResults);

      if (rangeLength === 0) {
        return [];
      }

      return Array.from({ length: rangeLength }, (_, index) => min + index);
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
      if (min > max) {
        return [];
      }

      const rangeLength = max - min + 1;
      assertWithinBounds(rangeLength, query, maxQueryResults);
      return Array.from({ length: rangeLength }, (_unused, index) => min + index);
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
      const zoneId = resolveSingleZoneSel(query.zone, ctx);
      const zones = queryAdjacentZones(ctx.adjacencyGraph, zoneId);
      assertWithinBounds(zones.length, query, maxQueryResults);
      return zones;
    }

    case 'tokensInAdjacentZones': {
      const zoneId = resolveSingleZoneSel(query.zone, ctx);
      const tokens = queryTokensInAdjacentZones(ctx.adjacencyGraph, ctx.state, zoneId);
      const filtered = query.filter !== undefined ? applyTokenFilters(tokens, query.filter, ctx) : tokens;
      assertWithinBounds(filtered.length, query, maxQueryResults);
      return filtered;
    }

    case 'connectedZones': {
      const zoneId = resolveSingleZoneSel(query.zone, ctx);
      const options =
        query.includeStart === undefined && query.maxDepth === undefined
          ? undefined
          : {
              ...(query.includeStart === undefined ? {} : { includeStart: query.includeStart }),
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

    default: {
      const _exhaustive: never = query;
      return _exhaustive;
    }
  }
}
