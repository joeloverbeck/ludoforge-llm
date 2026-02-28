import type { ConditionAST, OptionsQuery, ValueExpr, ZoneRef, ZoneSel } from './types.js';

const isBindingAlias = (zone: ZoneSel): boolean => zone.startsWith('$');

const collectZoneSelAlias = (zone: ZoneSel, aliases: Set<string>): void => {
  if (isBindingAlias(zone)) {
    aliases.add(zone);
  }
};

const collectZoneRefAliases = (zone: ZoneRef, aliases: Set<string>): void => {
  if (typeof zone === 'string') {
    collectZoneSelAlias(zone, aliases);
    return;
  }
  collectZoneSelectorAliasesFromValueExpr(zone.zoneExpr, aliases);
};

const collectZoneSelectorAliasesFromQuery = (query: OptionsQuery, aliases: Set<string>): void => {
  const collectTokenFilterAliases = (
    predicates: readonly { readonly value: ValueExpr | readonly (string | number | boolean)[] }[] | undefined,
  ): void => {
    for (const predicate of predicates ?? []) {
      if (Array.isArray(predicate.value) || typeof predicate.value === 'string' || typeof predicate.value === 'number' || typeof predicate.value === 'boolean') {
        continue;
      }
      collectZoneSelectorAliasesFromValueExpr(predicate.value as ValueExpr, aliases);
    }
  };

  switch (query.query) {
    case 'concat':
      for (const source of query.sources) {
        collectZoneSelectorAliasesFromQuery(source, aliases);
      }
      return;
    case 'tokensInZone':
      collectZoneRefAliases(query.zone, aliases);
      collectTokenFilterAliases(query.filter);
      return;
    case 'assetRows':
      for (const predicate of query.where ?? []) {
        if (Array.isArray(predicate.value) || typeof predicate.value === 'string' || typeof predicate.value === 'number' || typeof predicate.value === 'boolean') {
          continue;
        }
        collectZoneSelectorAliasesFromValueExpr(predicate.value as ValueExpr, aliases);
      }
      return;
    case 'tokensInMapSpaces':
      collectZoneSelectorAliasesFromCondition(query.spaceFilter?.condition, aliases);
      collectTokenFilterAliases(query.filter);
      return;
    case 'nextInOrderByCondition':
      collectZoneSelectorAliasesFromQuery(query.source, aliases);
      collectZoneSelectorAliasesFromValueExpr(query.from, aliases);
      collectZoneSelectorAliasesFromCondition(query.where, aliases);
      return;
    case 'intsInRange':
      collectZoneSelectorAliasesFromValueExpr(query.min, aliases);
      collectZoneSelectorAliasesFromValueExpr(query.max, aliases);
      if (query.step !== undefined) {
        collectZoneSelectorAliasesFromValueExpr(query.step, aliases);
      }
      for (const value of query.alwaysInclude ?? []) {
        collectZoneSelectorAliasesFromValueExpr(value, aliases);
      }
      if (query.maxResults !== undefined) {
        collectZoneSelectorAliasesFromValueExpr(query.maxResults, aliases);
      }
      return;
    case 'intsInVarRange':
      if (query.min !== undefined) {
        collectZoneSelectorAliasesFromValueExpr(query.min, aliases);
      }
      if (query.max !== undefined) {
        collectZoneSelectorAliasesFromValueExpr(query.max, aliases);
      }
      if (query.step !== undefined) {
        collectZoneSelectorAliasesFromValueExpr(query.step, aliases);
      }
      for (const value of query.alwaysInclude ?? []) {
        collectZoneSelectorAliasesFromValueExpr(value, aliases);
      }
      if (query.maxResults !== undefined) {
        collectZoneSelectorAliasesFromValueExpr(query.maxResults, aliases);
      }
      return;
    case 'zones':
    case 'mapSpaces':
      collectZoneSelectorAliasesFromCondition(query.filter?.condition, aliases);
      return;
    case 'adjacentZones':
      collectZoneRefAliases(query.zone, aliases);
      return;
    case 'tokensInAdjacentZones':
      collectZoneRefAliases(query.zone, aliases);
      collectTokenFilterAliases(query.filter);
      return;
    case 'connectedZones':
      collectZoneRefAliases(query.zone, aliases);
      collectZoneSelectorAliasesFromCondition(query.via, aliases);
      return;
    case 'enums':
    case 'globalMarkers':
    case 'players':
    case 'binding':
      return;
    default: {
      const exhaustive: never = query;
      return exhaustive;
    }
  }
};

export const collectZoneSelectorAliasesFromValueExpr = (
  value: ValueExpr,
  aliases: Set<string> = new Set<string>(),
): ReadonlySet<string> => {
  if (typeof value !== 'object' || value === null) {
    return aliases;
  }
  if ('ref' in value) {
    switch (value.ref) {
      case 'zoneVar':
      case 'zoneCount':
      case 'zoneProp':
        collectZoneSelAlias(value.zone, aliases);
        return aliases;
      case 'markerState':
        collectZoneSelAlias(value.space, aliases);
        return aliases;
      case 'gvar':
      case 'pvar':
      case 'tokenProp':
      case 'assetField':
      case 'binding':
      case 'globalMarkerState':
      case 'tokenZone':
      case 'activePlayer':
        return aliases;
      default: {
        const exhaustive: never = value;
        return exhaustive;
      }
    }
  }
  if ('op' in value) {
    collectZoneSelectorAliasesFromValueExpr(value.left, aliases);
    collectZoneSelectorAliasesFromValueExpr(value.right, aliases);
    return aliases;
  }
  if ('aggregate' in value) {
    collectZoneSelectorAliasesFromQuery(value.aggregate.query, aliases);
    if ('valueExpr' in value.aggregate) {
      collectZoneSelectorAliasesFromValueExpr(value.aggregate.valueExpr, aliases);
    }
    return aliases;
  }
  if ('concat' in value) {
    for (const entry of value.concat) {
      collectZoneSelectorAliasesFromValueExpr(entry, aliases);
    }
    return aliases;
  }
  if ('if' in value) {
    collectZoneSelectorAliasesFromCondition(value.if.when, aliases);
    collectZoneSelectorAliasesFromValueExpr(value.if.then, aliases);
    collectZoneSelectorAliasesFromValueExpr(value.if.else, aliases);
  }
  return aliases;
};

export const collectZoneSelectorAliasesFromCondition = (
  condition: ConditionAST | undefined,
  aliases: Set<string> = new Set<string>(),
): ReadonlySet<string> => {
  if (condition === undefined || typeof condition === 'boolean') {
    return aliases;
  }
  switch (condition.op) {
    case 'and':
    case 'or':
      for (const arg of condition.args) {
        collectZoneSelectorAliasesFromCondition(arg, aliases);
      }
      return aliases;
    case 'not':
      collectZoneSelectorAliasesFromCondition(condition.arg, aliases);
      return aliases;
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
      collectZoneSelectorAliasesFromValueExpr(condition.left, aliases);
      collectZoneSelectorAliasesFromValueExpr(condition.right, aliases);
      return aliases;
    case 'in':
      collectZoneSelectorAliasesFromValueExpr(condition.item, aliases);
      collectZoneSelectorAliasesFromValueExpr(condition.set, aliases);
      return aliases;
    case 'adjacent':
      collectZoneSelAlias(condition.left, aliases);
      collectZoneSelAlias(condition.right, aliases);
      return aliases;
    case 'connected':
      collectZoneSelAlias(condition.from, aliases);
      collectZoneSelAlias(condition.to, aliases);
      collectZoneSelectorAliasesFromCondition(condition.via, aliases);
      return aliases;
    case 'zonePropIncludes':
      collectZoneSelAlias(condition.zone, aliases);
      collectZoneSelectorAliasesFromValueExpr(condition.value, aliases);
      return aliases;
    default: {
      const exhaustive: never = condition;
      return exhaustive;
    }
  }
};
