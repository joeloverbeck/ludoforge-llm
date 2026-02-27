import type { OptionsQuery } from './types.js';
import { inferLeafOptionsQueryContract, type QueryRuntimeShape } from './query-kind-contract.js';

export type { QueryRuntimeShape } from './query-kind-contract.js';

export const inferQueryRuntimeShapes = (query: OptionsQuery): ReadonlySet<QueryRuntimeShape> => {
  const shapes = new Set<QueryRuntimeShape>();
  collectQueryRuntimeShapes(query, shapes);
  return shapes;
};

const collectQueryRuntimeShapes = (query: OptionsQuery, shapes: Set<QueryRuntimeShape>): void => {
  switch (query.query) {
    case 'concat':
      query.sources.forEach((source) => collectQueryRuntimeShapes(source, shapes));
      return;
    case 'nextInOrderByCondition':
      collectQueryRuntimeShapes(query.source, shapes);
      return;
    default:
      shapes.add(inferLeafOptionsQueryContract(query).runtimeShape);
      return;
  }
};
