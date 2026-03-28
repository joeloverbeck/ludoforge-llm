import type { ZoneId } from './branded.js';
import type { GameDef, GameState } from './types.js';

export interface LazyZoneTotals {
  get(key: string): number;
}

export interface LazyZoneVars {
  get(zoneId: ZoneId | string, varName: string): number | undefined;
}

export interface LazyMarkerStates {
  get(spaceId: string, markerName: string): string | undefined;
}

export interface EnumerationStateSnapshot {
  readonly globalVars: GameState['globalVars'];
  readonly perPlayerVars: GameState['perPlayerVars'];
  readonly zoneTotals: LazyZoneTotals;
  readonly zoneVars: LazyZoneVars;
  readonly markerStates: LazyMarkerStates;
}

interface ParsedZoneTotalKey {
  readonly zoneId: string;
  readonly tokenType: string | null;
}

const zoneIdsByDescendingLength = (def: GameDef): readonly string[] =>
  [...def.zones]
    .map((zone) => String(zone.id))
    .sort((left, right) => right.length - left.length || left.localeCompare(right));

const parseZoneTotalKey = (def: GameDef, key: string): ParsedZoneTotalKey => {
  if (key.length === 0) {
    throw new Error('Zone total key must not be empty');
  }

  if (key.endsWith(':*')) {
    const zoneId = key.slice(0, -2);
    if (!def.zones.some((zone) => String(zone.id) === zoneId)) {
      throw new Error(`Zone total key references unknown zone: ${key}`);
    }
    return { zoneId, tokenType: null };
  }

  for (const zoneId of zoneIdsByDescendingLength(def)) {
    const prefix = `${zoneId}:`;
    if (!key.startsWith(prefix)) {
      continue;
    }

    const tokenType = key.slice(prefix.length);
    if (tokenType.length === 0) {
      throw new Error(`Zone total key is missing token type: ${key}`);
    }

    return { zoneId, tokenType };
  }

  throw new Error(`Zone total key must match "<zoneId>:*" or "<zoneId>:<tokenType>": ${key}`);
};

export const computeZoneTotal = (
  state: GameState,
  def: GameDef,
  key: string,
): number => {
  const { zoneId, tokenType } = parseZoneTotalKey(def, key);
  const zoneTokens = state.zones[zoneId];
  if (zoneTokens === undefined) {
    throw new Error(`Zone total key references missing state zone: ${zoneId}`);
  }

  if (tokenType === null) {
    return zoneTokens.length;
  }

  let total = 0;
  for (const token of zoneTokens) {
    if (token.type === tokenType) {
      total += 1;
    }
  }
  return total;
};

export const createLazyZoneTotals = (
  state: GameState,
  def: GameDef,
): LazyZoneTotals => {
  const cache = new Map<string, number>();
  return {
    get(key: string): number {
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const computed = computeZoneTotal(state, def, key);
      cache.set(key, computed);
      return computed;
    },
  };
};

export const createLazyZoneVars = (
  state: GameState,
): LazyZoneVars => {
  const cache = new Map<string, number | undefined>();
  return {
    get(zoneId: ZoneId | string, varName: string): number | undefined {
      const key = `${String(zoneId)}\u0000${varName}`;
      if (cache.has(key)) {
        return cache.get(key);
      }

      const value = state.zoneVars[String(zoneId)]?.[varName];
      cache.set(key, value);
      return value;
    },
  };
};

export const createLazyMarkerStates = (
  state: GameState,
): LazyMarkerStates => {
  const cache = new Map<string, string | undefined>();
  return {
    get(spaceId: string, markerName: string): string | undefined {
      const key = `${spaceId}\u0000${markerName}`;
      if (cache.has(key)) {
        return cache.get(key);
      }

      const value = state.markers[spaceId]?.[markerName];
      cache.set(key, value);
      return value;
    },
  };
};

export const createEnumerationSnapshot = (
  def: GameDef,
  state: GameState,
): EnumerationStateSnapshot => ({
  globalVars: state.globalVars,
  perPlayerVars: state.perPlayerVars,
  zoneTotals: createLazyZoneTotals(state, def),
  zoneVars: createLazyZoneVars(state),
  markerStates: createLazyMarkerStates(state),
});
