import type { OptionsQuery } from './types.js';

export type LeafOptionsQuery = Exclude<
  OptionsQuery,
  { readonly query: 'concat' } | { readonly query: 'nextInOrderByCondition' }
>;

export const forEachOptionsQueryLeaf = (
  query: OptionsQuery,
  visitLeaf: (query: LeafOptionsQuery) => void,
): void => {
  switch (query.query) {
    case 'concat':
      query.sources.forEach((source) => forEachOptionsQueryLeaf(source, visitLeaf));
      return;
    case 'nextInOrderByCondition':
      forEachOptionsQueryLeaf(query.source, visitLeaf);
      return;
    default: {
      const leafQuery: LeafOptionsQuery = query;
      visitLeaf(leafQuery);
      return;
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
