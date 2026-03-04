import { getLeafOptionsQueryKindContract, getLeafOptionsQueryTransformContract } from './query-kind-map.js';
import type { LeafOptionsQueryTransformKind, QueryDomainKind, QueryRuntimeShape } from './query-kind-map.js';
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

export const inferTransformSourceIncompatibleRuntimeShapes = (
  kind: LeafOptionsQueryTransformKind,
  sourceShapes: readonly QueryRuntimeShape[],
): readonly QueryRuntimeShape[] => {
  const policy = getLeafOptionsQueryTransformContract(kind).sourceShapePolicy;
  const allowedShapes = new Set<QueryRuntimeShape>(policy.allowedSourceShapes);
  const incompatible = new Set<QueryRuntimeShape>();
  for (const shape of sourceShapes) {
    if (shape === 'unknown' && policy.allowUnknownSourceShape) {
      continue;
    }
    if (!allowedShapes.has(shape)) {
      incompatible.add(shape);
    }
  }
  return [...incompatible];
};
