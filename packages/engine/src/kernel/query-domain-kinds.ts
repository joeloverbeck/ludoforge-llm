import type { OptionsQuery } from './types.js';
import { inferLeafOptionsQueryContract, type QueryDomainKind, type QueryRuntimeShape } from './query-kind-contract.js';
import { forEachOptionsQueryLeaf } from './query-walk.js';

export type { QueryDomainKind } from './query-kind-contract.js';

export const inferQueryDomainKinds = (query: OptionsQuery): ReadonlySet<QueryDomainKind> => {
  const domains = new Set<QueryDomainKind>();
  forEachOptionsQueryLeaf(query, (leafQuery) => {
    domains.add(inferLeafOptionsQueryContract(leafQuery).domain);
  });
  return domains;
};

export const inferQueryRuntimeShapes = (query: OptionsQuery): ReadonlySet<QueryRuntimeShape> => {
  const shapes = new Set<QueryRuntimeShape>();
  forEachOptionsQueryLeaf(query, (leafQuery) => {
    shapes.add(inferLeafOptionsQueryContract(leafQuery).runtimeShape);
  });
  return shapes;
};
