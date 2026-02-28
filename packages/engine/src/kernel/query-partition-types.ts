import type { OPTIONS_QUERY_KIND_CONTRACT_MAP } from './query-kind-map.js';
import type { OptionsQuery } from './types.js';

type QueryPartition = (typeof OPTIONS_QUERY_KIND_CONTRACT_MAP)[keyof typeof OPTIONS_QUERY_KIND_CONTRACT_MAP]['partition'];

type OptionsQueryKindPartitionMap = {
  readonly [Kind in keyof typeof OPTIONS_QUERY_KIND_CONTRACT_MAP]: (typeof OPTIONS_QUERY_KIND_CONTRACT_MAP)[Kind]['partition'];
};

export type OptionsQueryKindPartitionCoverage = [
  Exclude<keyof OptionsQueryKindPartitionMap, OptionsQuery['query']>,
  Exclude<OptionsQuery['query'], keyof OptionsQueryKindPartitionMap>,
] extends [never, never]
  ? true
  : false;

type KindsByPartition<P extends QueryPartition> = {
  readonly [Kind in keyof OptionsQueryKindPartitionMap]: OptionsQueryKindPartitionMap[Kind] extends P ? Kind : never;
}[keyof OptionsQueryKindPartitionMap];

export type RecursiveOptionsQueryKind = KindsByPartition<'recursive'>;
export type RecursiveOptionsQuery = Extract<OptionsQuery, { readonly query: RecursiveOptionsQueryKind }>;

export type LeafOptionsQueryKind = Exclude<OptionsQuery['query'], RecursiveOptionsQueryKind>;
export type LeafOptionsQuery = Extract<OptionsQuery, { readonly query: LeafOptionsQueryKind }>;

export type RecursiveOptionsQueryKindCoverage = [
  Exclude<RecursiveOptionsQuery['query'], RecursiveOptionsQueryKind>,
  Exclude<RecursiveOptionsQueryKind, RecursiveOptionsQuery['query']>,
] extends [never, never]
  ? true
  : false;
