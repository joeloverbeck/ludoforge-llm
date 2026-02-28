import { OPTIONS_QUERY_KIND_CONTRACT_MAP } from './query-kind-map.js';
import type { QueryDomainKind, QueryRuntimeShape } from './query-kind-map.js';
import type { LeafOptionsQuery } from './query-partition-types.js';

export type { QueryDomainKind, QueryRuntimeShape } from './query-kind-map.js';

export interface LeafOptionsQueryContract {
  readonly domain: QueryDomainKind;
  readonly runtimeShape: QueryRuntimeShape;
}

function assertLeafOptionsQueryKindContract(
  contract: (typeof OPTIONS_QUERY_KIND_CONTRACT_MAP)[keyof typeof OPTIONS_QUERY_KIND_CONTRACT_MAP],
): asserts contract is Extract<
  (typeof OPTIONS_QUERY_KIND_CONTRACT_MAP)[keyof typeof OPTIONS_QUERY_KIND_CONTRACT_MAP],
  { readonly partition: 'leaf' }
> {
  if (contract.partition !== 'leaf') {
    throw new Error('Expected a leaf query kind contract.');
  }
}

export const inferLeafOptionsQueryContract = (query: LeafOptionsQuery): LeafOptionsQueryContract => {
  const contract = OPTIONS_QUERY_KIND_CONTRACT_MAP[query.query];
  assertLeafOptionsQueryKindContract(contract);
  return {
    domain: contract.domain,
    runtimeShape: contract.runtimeShape,
  };
};
