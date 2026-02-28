import type { LeafOptionsQuery, RecursiveOptionsQuery } from './query-partition-types.js';
import type { OptionsQuery } from './types.js';

const isRecursiveOptionsQuery = (query: OptionsQuery): query is RecursiveOptionsQuery =>
  query.query === 'concat' || query.query === 'nextInOrderByCondition';

const walkRecursiveOptionsQuery = (
  query: RecursiveOptionsQuery,
  visitLeaf: (query: LeafOptionsQuery) => void,
): void => {
  switch (query.query) {
    case 'concat':
      query.sources.forEach((source) => forEachOptionsQueryLeaf(source, visitLeaf));
      return;
    case 'nextInOrderByCondition':
      forEachOptionsQueryLeaf(query.source, visitLeaf);
      return;
  }

  const exhaustive: never = query;
  return exhaustive;
};

export const forEachOptionsQueryLeaf = (
  query: OptionsQuery,
  visitLeaf: (query: LeafOptionsQuery) => void,
): void => {
  if (isRecursiveOptionsQuery(query)) {
    walkRecursiveOptionsQuery(query, visitLeaf);
    return;
  }

  visitLeaf(query);
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
