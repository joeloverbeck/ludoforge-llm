import type { OptionsQuery } from './types.js';

export type QueryDomainKind = 'token' | 'zone' | 'other';
export type QueryRuntimeShape = 'token' | 'object' | 'number' | 'string' | 'unknown';

export type QueryPartitionKind = 'recursive' | 'leaf';

type RecursiveQueryKindContract = {
  readonly partition: 'recursive';
};

type LeafQueryKindContract = {
  readonly partition: 'leaf';
  readonly domain: QueryDomainKind;
  readonly runtimeShape: QueryRuntimeShape;
};

type OptionsQueryKindContract = RecursiveQueryKindContract | LeafQueryKindContract;

type OptionsQueryKindContractMap = {
  readonly [Kind in OptionsQuery['query']]: OptionsQueryKindContract;
};

type LeafQueryKindContractView<Contracts extends OptionsQueryKindContractMap> = {
  readonly [Kind in keyof Contracts as Contracts[Kind] extends LeafQueryKindContract ? Kind : never]: Extract<
    Contracts[Kind],
    LeafQueryKindContract
  >;
};

export const OPTIONS_QUERY_KIND_CONTRACT_MAP = {
  concat: { partition: 'recursive' },
  tokensInZone: { partition: 'leaf', domain: 'token', runtimeShape: 'token' },
  assetRows: { partition: 'leaf', domain: 'other', runtimeShape: 'object' },
  tokensInMapSpaces: { partition: 'leaf', domain: 'token', runtimeShape: 'token' },
  nextInOrderByCondition: { partition: 'recursive' },
  intsInRange: { partition: 'leaf', domain: 'other', runtimeShape: 'number' },
  intsInVarRange: { partition: 'leaf', domain: 'other', runtimeShape: 'number' },
  enums: { partition: 'leaf', domain: 'other', runtimeShape: 'string' },
  globalMarkers: { partition: 'leaf', domain: 'other', runtimeShape: 'string' },
  players: { partition: 'leaf', domain: 'other', runtimeShape: 'number' },
  zones: { partition: 'leaf', domain: 'zone', runtimeShape: 'string' },
  mapSpaces: { partition: 'leaf', domain: 'zone', runtimeShape: 'string' },
  adjacentZones: { partition: 'leaf', domain: 'zone', runtimeShape: 'string' },
  tokensInAdjacentZones: { partition: 'leaf', domain: 'token', runtimeShape: 'token' },
  connectedZones: { partition: 'leaf', domain: 'zone', runtimeShape: 'string' },
  binding: { partition: 'leaf', domain: 'other', runtimeShape: 'unknown' },
} as const satisfies OptionsQueryKindContractMap;

export type LeafOptionsQueryKindFromContractMap = keyof LeafQueryKindContractView<typeof OPTIONS_QUERY_KIND_CONTRACT_MAP>;

export type LeafOptionsQueryKindContractFromMap<
  Kind extends LeafOptionsQueryKindFromContractMap = LeafOptionsQueryKindFromContractMap,
> = LeafQueryKindContractView<typeof OPTIONS_QUERY_KIND_CONTRACT_MAP>[Kind];

export const getLeafOptionsQueryKindContract = <Kind extends LeafOptionsQueryKindFromContractMap>(
  kind: Kind,
): LeafOptionsQueryKindContractFromMap<Kind> => OPTIONS_QUERY_KIND_CONTRACT_MAP[kind];
