import { asZoneId, type ZoneId } from './branded.js';
import type { ReadContext } from './eval-context.js';
import { evalValue } from './eval-value.js';
import { resolveSingleZoneSel } from './resolve-selectors.js';
import type { ZoneRef } from './types.js';
import { toOwnedZoneId, type ZoneAddressOwner } from './zone-address.js';

const knownZoneIdCache = new WeakMap<ReadonlyArray<{ readonly id: ZoneId }>, ReadonlySet<ZoneId>>();

function listKnownZoneIds(ctx: Pick<ReadContext, 'def'>): ReadonlySet<ZoneId> {
  const cached = knownZoneIdCache.get(ctx.def.zones);
  if (cached !== undefined) {
    return cached;
  }
  const zoneIds = new Set(ctx.def.zones.map((zone) => zone.id));
  knownZoneIdCache.set(ctx.def.zones, zoneIds);
  return zoneIds;
}

export function resolveKnownZoneId(zoneId: string, ctx: Pick<ReadContext, 'def'>): ZoneId | undefined {
  const resolved = asZoneId(zoneId);
  return listKnownZoneIds(ctx).has(resolved) ? resolved : undefined;
}

export function resolveZoneRef(ref: ZoneRef, ctx: ReadContext): ZoneId {
  if (typeof ref === 'string') {
    const exactZoneId = resolveKnownZoneId(ref, ctx);
    if (exactZoneId !== undefined) {
      return exactZoneId;
    }
    return resolveSingleZoneSel(ref, ctx);
  }
  const zoneString = String(evalValue(ref.zoneExpr, ctx));
  const exactZoneId = resolveKnownZoneId(zoneString, ctx);
  if (exactZoneId !== undefined) {
    return exactZoneId;
  }
  return resolveSingleZoneSel(zoneString, ctx);
}

export function resolveZoneRefWithOwnerFallback(
  zoneRef: string,
  owner: ZoneAddressOwner,
  ctx: ReadContext,
): ZoneId | undefined {
  try {
    return resolveZoneRef(zoneRef, ctx);
  } catch {
    const ownedZoneId = toOwnedZoneId(zoneRef, owner);
    return resolveKnownZoneId(ownedZoneId, ctx);
  }
}
