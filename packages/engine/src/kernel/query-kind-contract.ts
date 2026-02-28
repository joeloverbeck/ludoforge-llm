import type { LeafOptionsQuery } from './query-partition-types.js';

export type QueryDomainKind = 'token' | 'zone' | 'other';
export type QueryRuntimeShape = 'token' | 'object' | 'number' | 'string' | 'unknown';

export interface LeafOptionsQueryContract {
  readonly domain: QueryDomainKind;
  readonly runtimeShape: QueryRuntimeShape;
}

export const inferLeafOptionsQueryContract = (query: LeafOptionsQuery): LeafOptionsQueryContract => {
  switch (query.query) {
    case 'tokensInZone':
    case 'tokensInMapSpaces':
    case 'tokensInAdjacentZones':
      return { domain: 'token', runtimeShape: 'token' };
    case 'assetRows':
      return { domain: 'other', runtimeShape: 'object' };
    case 'intsInRange':
    case 'intsInVarRange':
    case 'players':
      return { domain: 'other', runtimeShape: 'number' };
    case 'enums':
    case 'globalMarkers':
      return { domain: 'other', runtimeShape: 'string' };
    case 'zones':
    case 'mapSpaces':
    case 'adjacentZones':
    case 'connectedZones':
      return { domain: 'zone', runtimeShape: 'string' };
    case 'binding':
      return { domain: 'other', runtimeShape: 'unknown' };
  }

  const exhaustive: never = query;
  return exhaustive;
};
