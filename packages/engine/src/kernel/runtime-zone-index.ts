import { asRuntimeZoneId, type RuntimeZoneId, type ZoneId } from './branded.js';
import type { GameDef, ZoneAdjacency, ZoneBehavior, ZoneDef } from './types.js';

export interface RuntimeZoneAdjacency extends Omit<ZoneAdjacency, 'to'> {
  readonly to: RuntimeZoneId;
}

export type RuntimeZoneBehavior =
  | {
      readonly type: 'deck';
      readonly drawFrom: 'top' | 'bottom' | 'random';
      readonly reshuffleFrom?: RuntimeZoneId;
    };

export interface RuntimeZoneDef extends Omit<ZoneDef, 'id' | 'adjacentTo' | 'behavior'> {
  readonly id: RuntimeZoneId;
  readonly canonicalId: ZoneId;
  readonly adjacentTo?: readonly RuntimeZoneAdjacency[];
  readonly behavior?: RuntimeZoneBehavior;
}

export interface ZoneRuntimeIndex {
  readonly zoneIds: readonly RuntimeZoneId[];
  readonly canonicalIds: readonly ZoneId[];
  readonly runtimeIdByCanonicalId: ReadonlyMap<ZoneId, RuntimeZoneId>;
  readonly canonicalIdByRuntimeId: readonly ZoneId[];
  readonly zones: readonly RuntimeZoneDef[];
  readonly zoneByRuntimeId: ReadonlyMap<RuntimeZoneId, RuntimeZoneDef>;
}

type ZoneRuntimeSource = GameDef | readonly ZoneDef[];

const zoneRuntimeIndexCache = new WeakMap<object, ZoneRuntimeIndex>();

function isGameDef(source: ZoneRuntimeSource): source is GameDef {
  return !Array.isArray(source);
}

function sourceKey(source: ZoneRuntimeSource): object {
  return source;
}

function getSourceZones(source: ZoneRuntimeSource): readonly ZoneDef[] {
  return isGameDef(source) ? source.zones : source;
}

function deriveCanonicalIds(source: ZoneRuntimeSource, zoneDefsById: ReadonlyMap<ZoneId, ZoneDef>): readonly ZoneId[] {
  if (!isGameDef(source) || source.internTable === undefined) {
    return [...zoneDefsById.keys()].sort((left, right) => left.localeCompare(right));
  }

  const ordered = source.internTable.zones
    .map((zoneId) => zoneDefsById.get(zoneId as ZoneId)?.id)
    .filter((zoneId): zoneId is ZoneId => zoneId !== undefined);
  return ordered.length === zoneDefsById.size
    ? ordered
    : [...zoneDefsById.keys()].sort((left, right) => left.localeCompare(right));
}

function normalizeBehavior(
  behavior: ZoneBehavior | undefined,
  runtimeIdByCanonicalId: ReadonlyMap<ZoneId, RuntimeZoneId>,
): RuntimeZoneBehavior | undefined {
  if (behavior === undefined) {
    return undefined;
  }
  const reshuffleFrom = behavior.reshuffleFrom === undefined
    ? undefined
    : runtimeIdByCanonicalId.get(behavior.reshuffleFrom);
  return reshuffleFrom === undefined
    ? {
        type: 'deck',
        drawFrom: behavior.drawFrom,
      }
    : {
        type: 'deck',
        drawFrom: behavior.drawFrom,
        reshuffleFrom,
      };
}

function normalizeAdjacency(
  adjacentTo: readonly ZoneAdjacency[] | undefined,
  runtimeIdByCanonicalId: ReadonlyMap<ZoneId, RuntimeZoneId>,
): readonly RuntimeZoneAdjacency[] | undefined {
  if (adjacentTo === undefined) {
    return undefined;
  }
  return adjacentTo
    .map((entry) => {
      const runtimeId = runtimeIdByCanonicalId.get(entry.to);
      if (runtimeId === undefined) {
        return null;
      }
      return {
        ...entry,
        to: runtimeId,
      };
    })
    .filter((entry): entry is RuntimeZoneAdjacency => entry !== null);
}

function buildZoneRuntimeIndexUncached(source: ZoneRuntimeSource): ZoneRuntimeIndex {
  const zones = getSourceZones(source);
  const zoneDefsById = new Map(zones.map((zone) => [zone.id, zone] as const));
  const canonicalIds = deriveCanonicalIds(source, zoneDefsById);
  const runtimeIdByCanonicalId = new Map<ZoneId, RuntimeZoneId>();

  canonicalIds.forEach((zoneId, index) => {
    runtimeIdByCanonicalId.set(zoneId, asRuntimeZoneId(index));
  });

  const normalizedZones = canonicalIds.map((canonicalId) => {
    const zone = zoneDefsById.get(canonicalId);
    if (zone === undefined) {
      throw new Error(`Runtime zone index missing declared zone: ${canonicalId}`);
    }
    const {
      id: _zoneId,
      adjacentTo,
      behavior,
      ...zoneRest
    } = zone;

    const normalizedZone: RuntimeZoneDef = {
      ...zoneRest,
      id: runtimeIdByCanonicalId.get(canonicalId)!,
      canonicalId,
    };
    const normalizedAdjacency = normalizeAdjacency(adjacentTo, runtimeIdByCanonicalId);
    if (normalizedAdjacency !== undefined) {
      Object.assign(normalizedZone, { adjacentTo: normalizedAdjacency });
    }
    const normalizedBehavior = normalizeBehavior(behavior, runtimeIdByCanonicalId);
    if (normalizedBehavior !== undefined) {
      Object.assign(normalizedZone, { behavior: normalizedBehavior });
    }
    return normalizedZone;
  });

  return {
    zoneIds: normalizedZones.map((zone) => zone.id),
    canonicalIds,
    runtimeIdByCanonicalId,
    canonicalIdByRuntimeId: canonicalIds,
    zones: normalizedZones,
    zoneByRuntimeId: new Map(normalizedZones.map((zone) => [zone.id, zone] as const)),
  };
}

export function buildZoneRuntimeIndex(source: ZoneRuntimeSource): ZoneRuntimeIndex {
  const key = sourceKey(source);
  const cached = zoneRuntimeIndexCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const built = buildZoneRuntimeIndexUncached(source);
  zoneRuntimeIndexCache.set(key, built);
  return built;
}

export function externRuntimeZoneId(zoneId: RuntimeZoneId, index: ZoneRuntimeIndex): ZoneId {
  const canonicalId = index.canonicalIdByRuntimeId[zoneId];
  if (canonicalId === undefined) {
    throw new Error(`Unknown runtime zone id: ${String(zoneId)}`);
  }
  return canonicalId;
}

export function internRuntimeZoneId(zoneId: ZoneId, index: ZoneRuntimeIndex): RuntimeZoneId | undefined {
  return index.runtimeIdByCanonicalId.get(zoneId);
}
