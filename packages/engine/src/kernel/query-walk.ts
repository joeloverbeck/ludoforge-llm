import type { LeafOptionsQuery, RecursiveOptionsQuery } from './query-partition-types.js';
import type { RecursiveOptionsQueryKind } from './query-partition-types.js';
import type { OptionsQuery } from './types.js';

type RecursiveOptionsQueryDispatchMap = {
  readonly [Kind in RecursiveOptionsQueryKind]: (
    query: Extract<RecursiveOptionsQuery, { readonly query: Kind }>,
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

const walkRecursiveOptionsQuery = (query: RecursiveOptionsQuery, visitLeaf: (query: LeafOptionsQuery) => void): void => {
  switch (query.query) {
    case 'concat':
      recursiveOptionsQueryDispatch.concat(query, visitLeaf);
      return;
    case 'nextInOrderByCondition':
      recursiveOptionsQueryDispatch.nextInOrderByCondition(query, visitLeaf);
      return;
  }
  const exhaustive: never = query;
  return exhaustive;
};

export const forEachOptionsQueryLeaf = (
  query: OptionsQuery,
  visitLeaf: (query: LeafOptionsQuery) => void,
): void => {
  switch (query.query) {
    case 'concat':
    case 'nextInOrderByCondition':
      walkRecursiveOptionsQuery(query, visitLeaf);
      return;
    default: {
      const leafQuery: LeafOptionsQuery = query;
      visitLeaf(leafQuery);
    }
  }
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
