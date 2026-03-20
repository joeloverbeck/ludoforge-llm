/**
 * WeakMap-cached lookup maps for GameDef collections.
 * Replaces O(n) linear `.find()` calls with O(1) Map lookups.
 */
import type { GameDef, SpaceMarkerLatticeDef, ZoneDef } from './types.js';

const zoneMapCache = new WeakMap<readonly ZoneDef[], ReadonlyMap<string, ZoneDef>>();

function getZoneMapFromArray(zones: readonly ZoneDef[]): ReadonlyMap<string, ZoneDef> {
  let map = zoneMapCache.get(zones);
  if (map === undefined) {
    const built = new Map<string, ZoneDef>();
    for (const zone of zones) {
      built.set(zone.id, zone);
    }
    map = built;
    zoneMapCache.set(zones, map);
  }
  return map;
}

export function getZoneMap(def: GameDef): ReadonlyMap<string, ZoneDef> {
  return getZoneMapFromArray(def.zones);
}

export { getZoneMapFromArray };

const latticeMapCache = new WeakMap<readonly SpaceMarkerLatticeDef[], ReadonlyMap<string, SpaceMarkerLatticeDef>>();

/**
 * Returns a cached `Map<latticeId, SpaceMarkerLatticeDef>` for the given GameDef.
 * Returns undefined if the def has no marker lattices.
 */
export function getLatticeMap(def: GameDef): ReadonlyMap<string, SpaceMarkerLatticeDef> | undefined {
  const lattices = def.markerLattices;
  if (lattices === undefined || lattices.length === 0) return undefined;

  let map = latticeMapCache.get(lattices);
  if (map === undefined) {
    const built = new Map<string, SpaceMarkerLatticeDef>();
    for (const lattice of lattices) {
      built.set(lattice.id, lattice);
    }
    map = built;
    latticeMapCache.set(lattices, map);
  }
  return map;
}
