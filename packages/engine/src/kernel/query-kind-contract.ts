import { getLeafOptionsQueryKindContract } from './query-kind-map.js';
import type { QueryDomainKind, QueryRuntimeShape } from './query-kind-map.js';
import type { LeafOptionsQuery } from './query-partition-types.js';

export type { QueryDomainKind, QueryRuntimeShape } from './query-kind-map.js';

export interface LeafOptionsQueryContract {
  readonly domain: QueryDomainKind;
  readonly runtimeShape: QueryRuntimeShape;
}

export const inferLeafOptionsQueryContract = (query: LeafOptionsQuery): LeafOptionsQueryContract => {
  const contract = getLeafOptionsQueryKindContract(query.query);
  return {
    domain: contract.domain,
    runtimeShape: contract.runtimeShape,
  };
};
