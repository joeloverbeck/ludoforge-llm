import type { ZoneId } from './branded.js';
import type { GameDef, GameState } from './types.js';

export interface LazyZoneTotals {
  get(zoneId: ZoneId | string, tokenType?: string): number;
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

const hasDeclaredZone = (def: GameDef, zoneId: string): boolean =>
  def.zones.some((zone) => String(zone.id) === zoneId);

const zoneTotalsCacheKey = (zoneId: string, tokenType?: string): string =>
  tokenType === undefined ? `${zoneId}\u0000*` : `${zoneId}\u0000${tokenType}`;

export const computeZoneTotal = (
  state: GameState,
  def: GameDef,
  zoneId: ZoneId | string,
  tokenType?: string,
): number => {
  const normalizedZoneId = String(zoneId);
  if (normalizedZoneId.length === 0) {
    throw new Error('Zone id must not be empty');
  }

  if (!hasDeclaredZone(def, normalizedZoneId)) {
    throw new Error(`Zone totals reference unknown zone: ${normalizedZoneId}`);
  }

  const zoneTokens = state.zones[normalizedZoneId];
  if (zoneTokens === undefined) {
    throw new Error(`Zone totals reference missing state zone: ${normalizedZoneId}`);
  }

  if (tokenType === undefined) {
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
    get(zoneId: ZoneId | string, tokenType?: string): number {
      const cacheKey = zoneTotalsCacheKey(String(zoneId), tokenType);
      const cached = cache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      const computed = computeZoneTotal(state, def, zoneId, tokenType);
      cache.set(cacheKey, computed);
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
