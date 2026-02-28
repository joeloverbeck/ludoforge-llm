import type { OptionsQuery } from './types.js';
import { inferLeafOptionsQueryContract, type QueryRuntimeShape } from './query-kind-contract.js';
import { forEachOptionsQueryLeaf } from './query-walk.js';

export type { QueryRuntimeShape } from './query-kind-contract.js';

export const inferQueryRuntimeShapes = (query: OptionsQuery): ReadonlySet<QueryRuntimeShape> => {
  const shapes = new Set<QueryRuntimeShape>();
  forEachOptionsQueryLeaf(query, (leafQuery) => {
    shapes.add(inferLeafOptionsQueryContract(leafQuery).runtimeShape);
  });
  return shapes;
};
