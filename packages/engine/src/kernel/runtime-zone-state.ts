import type { RuntimeZoneId, ZoneId } from './branded.js';
import { externRuntimeZoneId, internRuntimeZoneId, type ZoneRuntimeIndex } from './runtime-zone-index.js';
import type { GameState, Token } from './types.js';

const zoneTokenArraysByState = new WeakMap<GameState, readonly (readonly Token[])[]>();

const hasOwnZoneState = (state: GameState, zoneId: ZoneId): boolean =>
  Object.prototype.hasOwnProperty.call(state.zones, zoneId);

function buildRuntimeZoneTokenArrays(
  state: GameState,
  zoneRuntimeIndex: ZoneRuntimeIndex,
): readonly (readonly Token[])[] {
  return zoneRuntimeIndex.canonicalIds.map((zoneId) => state.zones[zoneId] ?? []);
}

export function getRuntimeZoneTokenArrays(
  state: GameState,
  zoneRuntimeIndex: ZoneRuntimeIndex,
): readonly (readonly Token[])[] {
  const cached = zoneTokenArraysByState.get(state);
  if (cached !== undefined) {
    return cached;
  }

  const built = buildRuntimeZoneTokenArrays(state, zoneRuntimeIndex);
  zoneTokenArraysByState.set(state, built);
  return built;
}

export function getZoneTokensByRuntimeId(
  state: GameState,
  zoneId: RuntimeZoneId,
  zoneRuntimeIndex: ZoneRuntimeIndex,
): readonly Token[] | undefined {
  const canonicalZoneId = externRuntimeZoneId(zoneId, zoneRuntimeIndex);
  if (!hasOwnZoneState(state, canonicalZoneId)) {
    return undefined;
  }
  return getRuntimeZoneTokenArrays(state, zoneRuntimeIndex)[zoneId] ?? [];
}

export function getZoneTokensByCanonicalId(
  state: GameState,
  zoneId: ZoneId,
  zoneRuntimeIndex: ZoneRuntimeIndex,
): readonly Token[] | undefined {
  const runtimeZoneId = internRuntimeZoneId(zoneId, zoneRuntimeIndex);
  if (runtimeZoneId === undefined) {
    return hasOwnZoneState(state, zoneId) ? state.zones[zoneId] ?? [] : undefined;
  }
  return getZoneTokensByRuntimeId(state, runtimeZoneId, zoneRuntimeIndex);
}

export function invalidateRuntimeZoneStateCache(state: GameState): void {
  zoneTokenArraysByState.delete(state);
}
