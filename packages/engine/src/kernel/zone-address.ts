import { asZoneId, type PlayerId, type ZoneId } from './branded.js';

export type ZoneAddressOwner = 'none' | PlayerId;

export function toOwnedZoneId(zoneBase: string, owner: ZoneAddressOwner): ZoneId {
  return asZoneId(`${zoneBase}:${owner}`);
}
