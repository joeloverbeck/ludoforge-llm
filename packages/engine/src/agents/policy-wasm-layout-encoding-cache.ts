import type { EncodedStateLayout, GameDef } from '../kernel/index.js';

const layoutIdentityCache = new WeakMap<EncodedStateLayout, WeakMap<GameDef, number>>();
const zoneKindCodeCache = new WeakMap<EncodedStateLayout, WeakMap<GameDef, readonly number[]>>();

const layoutIdentity = (layout: EncodedStateLayout, def: GameDef): number => {
  let hash = 0x811c9dc5;
  const mix = (value: number): void => {
    hash ^= value | 0;
    hash = Math.imul(hash, 0x01000193);
  };
  for (const value of [
    layout.zoneIds.length,
    layout.playerIds.length,
    layout.tokenLayout.scalarPropIds.length,
    layout.varLayout.globalVariableIds.length,
    layout.varLayout.perPlayerVariableIds.length,
    layout.varLayout.zoneVariableIds.length,
    layout.bitsetLayout.globalMarkerWordCount,
  ]) {
    mix(value);
  }
  for (const zoneKind of cachedZoneKindCodes(layout, def)) {
    mix(zoneKind);
  }
  return hash >>> 1;
};

export const cachedLayoutIdentity = (layout: EncodedStateLayout, def: GameDef): number => {
  const cachedByDef = layoutIdentityCache.get(layout);
  const cached = cachedByDef?.get(def);
  if (cached !== undefined) {
    return cached;
  }
  const identity = layoutIdentity(layout, def);
  if (cachedByDef !== undefined) {
    cachedByDef.set(def, identity);
  } else {
    layoutIdentityCache.set(layout, new WeakMap([[def, identity]]));
  }
  return identity;
};

export const cachedZoneKindCodes = (layout: EncodedStateLayout, def: GameDef): readonly number[] => {
  const cachedByDef = zoneKindCodeCache.get(layout);
  const cached = cachedByDef?.get(def);
  if (cached !== undefined) {
    return cached;
  }
  const zoneKindById = new Map(def.zones.map((zone) => [String(zone.id), (zone.zoneKind ?? 'board') === 'aux' ? 2 : 1] as const));
  const codes = layout.zoneIds.map((zoneId) => zoneKindById.get(String(zoneId)) ?? 1);
  if (cachedByDef !== undefined) {
    cachedByDef.set(def, codes);
  } else {
    zoneKindCodeCache.set(layout, new WeakMap([[def, codes]]));
  }
  return codes;
};
