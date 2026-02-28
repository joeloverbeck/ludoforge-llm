import type { OptionsQuery } from './types.js';

export type RecursiveOptionsQueryKind = 'concat' | 'nextInOrderByCondition';
export type RecursiveOptionsQuery = Extract<OptionsQuery, { readonly query: RecursiveOptionsQueryKind }>;

export type LeafOptionsQueryKind = Exclude<OptionsQuery['query'], RecursiveOptionsQueryKind>;
export type LeafOptionsQuery = Extract<OptionsQuery, { readonly query: LeafOptionsQueryKind }>;

type StructuredRecursiveOptionsQuery = Extract<
  OptionsQuery,
  { readonly source: OptionsQuery } | { readonly sources: readonly [OptionsQuery, ...OptionsQuery[]] }
>;

export type RecursiveOptionsQueryKindCoverage = [
  Exclude<StructuredRecursiveOptionsQuery['query'], RecursiveOptionsQueryKind>,
  Exclude<RecursiveOptionsQueryKind, StructuredRecursiveOptionsQuery['query']>,
] extends [never, never]
  ? true
  : false;
