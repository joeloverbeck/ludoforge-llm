import type { OptionsQuery } from './types.js';
import { inferLeafOptionsQueryContract, type QueryDomainKind } from './query-kind-contract.js';

export type { QueryDomainKind } from './query-kind-contract.js';

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
    default:
      domains.add(inferLeafOptionsQueryContract(query).domain);
      return;
  }
};
