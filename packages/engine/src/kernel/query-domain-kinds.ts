import type { OptionsQuery } from './types.js';

export type QueryDomainKind = 'token' | 'zone' | 'other';

export const inferQueryDomainKinds = (query: OptionsQuery): ReadonlySet<QueryDomainKind> => {
  const domains = new Set<QueryDomainKind>();
  collectQueryDomainKinds(query, domains);
  return domains;
};

const collectQueryDomainKinds = (query: OptionsQuery, domains: Set<QueryDomainKind>): void => {
  switch (query.query) {
    case 'concat':
      query.sources.forEach((source) => collectQueryDomainKinds(source, domains));
      return;
    case 'nextInOrderByCondition':
      collectQueryDomainKinds(query.source, domains);
      return;
    case 'tokensInZone':
    case 'tokensInAdjacentZones':
    case 'tokensInMapSpaces':
      domains.add('token');
      return;
    case 'zones':
    case 'mapSpaces':
    case 'adjacentZones':
    case 'connectedZones':
      domains.add('zone');
      return;
    default:
      domains.add('other');
  }
};
