import { getMaxQueryResults, type EvalContext } from './eval-context.js';
import { missingVarError, queryBoundsExceededError } from './eval-error.js';
import { evalValue } from './eval-value.js';
import { emitWarning } from './execution-collector.js';
import { resolvePlayerSel, resolveSingleZoneSel } from './resolve-selectors.js';
import { asPlayerId, type PlayerId, type ZoneId } from './branded.js';
import { queryAdjacentZones, queryConnectedZones, queryTokensInAdjacentZones } from './spatial.js';
import type { OptionsQuery, Token, TokenFilterPredicate, ValueExpr } from './types.js';

type QueryResult = Token | number | string | PlayerId | ZoneId;

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

function tokenMatchesPredicate(token: Token, predicate: TokenFilterPredicate, ctx: EvalContext): boolean {
  const propValue = token.props[predicate.prop];
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

function evalZonesQuery(query: Extract<OptionsQuery, { readonly query: 'zones' }>, ctx: EvalContext): readonly ZoneId[] {
  const allZones = [...ctx.def.zones].sort((left, right) => left.id.localeCompare(right.id));
  const allZoneIds = allZones.map((zone) => zone.id);

  if (query.filter?.owner === undefined) {
    return allZoneIds;
  }

  const owners = new Set(resolvePlayerSel(query.filter.owner, ctx));
  return allZones
    .filter((zone) => {
      if (zone.owner !== 'player') {
        return false;
      }

      const ownerQualifier = extractOwnerQualifier(zone.id);
      if (ownerQualifier === null || !/^[0-9]+$/.test(ownerQualifier)) {
        return false;
      }

      const playerId = asPlayerId(Number(ownerQualifier));
      return owners.has(playerId);
    })
    .map((zone) => zone.id);
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

    case 'intsInRange': {
      const rangeLength = query.max < query.min ? 0 : query.max - query.min + 1;
      assertWithinBounds(rangeLength, query, maxQueryResults);

      if (rangeLength === 0) {
        return [];
      }

      return Array.from({ length: rangeLength }, (_, index) => query.min + index);
    }

    case 'enums': {
      assertWithinBounds(query.values.length, query, maxQueryResults);
      return [...query.values];
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
      const boundValue = bindings[query.name];
      if (boundValue === undefined) {
        throw missingVarError(`Binding not found: ${query.name}`, {
          query,
          binding: query.name,
          availableBindings: Object.keys(bindings).sort(),
        });
      }

      if (!Array.isArray(boundValue)) {
        throw missingVarError(`Binding query requires an array value, got ${typeof boundValue}: ${query.name}`, {
          query,
          binding: query.name,
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
