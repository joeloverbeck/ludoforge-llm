import type { LeafOptionsQuery, RecursiveOptionsQuery } from './query-partition-types.js';
import type { RecursiveOptionsQueryKind } from './query-partition-types.js';
import type { OptionsQuery } from './types.js';

type RecursiveOptionsQueryByKind = {
  readonly [Kind in RecursiveOptionsQueryKind]: Extract<RecursiveOptionsQuery, { readonly query: Kind }>;
};

type RecursiveOptionsQueryDispatchMap = {
  readonly [Kind in RecursiveOptionsQueryKind]: (
    query: RecursiveOptionsQueryByKind[Kind],
    visitLeaf: (query: LeafOptionsQuery) => void,
  ) => void;
};

const recursiveOptionsQueryDispatch: RecursiveOptionsQueryDispatchMap = {
  concat: (query, visitLeaf) => {
    query.sources.forEach((source) => forEachOptionsQueryLeaf(source, visitLeaf));
  },
  nextInOrderByCondition: (query, visitLeaf) => {
    forEachOptionsQueryLeaf(query.source, visitLeaf);
  },
};

export type RecursiveOptionsQueryDispatchCoverage = [
  Exclude<RecursiveOptionsQueryKind, keyof typeof recursiveOptionsQueryDispatch>,
  Exclude<keyof typeof recursiveOptionsQueryDispatch, RecursiveOptionsQueryKind>,
] extends [never, never]
  ? true
  : false;

const isRecursiveOptionsQuery = (query: OptionsQuery): query is RecursiveOptionsQuery =>
  Object.prototype.hasOwnProperty.call(recursiveOptionsQueryDispatch, query.query);

const walkRecursiveOptionsQuery = <Kind extends RecursiveOptionsQueryKind>(
  query: RecursiveOptionsQueryByKind[Kind],
  visitLeaf: (query: LeafOptionsQuery) => void,
): void => {
  recursiveOptionsQueryDispatch[query.query](query, visitLeaf);
};

export const forEachOptionsQueryLeaf = (
  query: OptionsQuery,
  visitLeaf: (query: LeafOptionsQuery) => void,
): void => {
  if (isRecursiveOptionsQuery(query)) {
    walkRecursiveOptionsQuery(query, visitLeaf);
    return;
  }

  const leafQuery: LeafOptionsQuery = query;
  visitLeaf(leafQuery);
};

export const reduceOptionsQueryLeaves = <TAcc>(
  query: OptionsQuery,
  initial: TAcc,
  reduceLeaf: (acc: TAcc, query: LeafOptionsQuery) => TAcc,
): TAcc => {
  let acc = initial;
  forEachOptionsQueryLeaf(query, (leafQuery) => {
    acc = reduceLeaf(acc, leafQuery);
  });
  return acc;
};
