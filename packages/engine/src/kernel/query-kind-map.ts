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

export type LeafOptionsQueryTransformKind = Extract<OptionsQuery, { readonly query: 'tokenZones' }>['query'];

type TransformQueryByKind<Kind extends LeafOptionsQueryTransformKind> = Extract<OptionsQuery, { readonly query: Kind }>;

export interface QueryTransformSourceShapePolicy {
  readonly allowedSourceShapes: readonly QueryRuntimeShape[];
  readonly allowUnknownSourceShape: boolean;
  readonly mismatchDiagnosticCode: string;
  readonly mismatchSuggestion: string;
}

type TransformBooleanOptionField<Kind extends LeafOptionsQueryTransformKind> = Exclude<
  Extract<keyof TransformQueryByKind<Kind>, string>,
  'query' | 'source'
>;

export interface QueryTransformBooleanOptionPolicy<Kind extends LeafOptionsQueryTransformKind> {
  readonly field: TransformBooleanOptionField<Kind>;
  readonly diagnosticCode: string;
  readonly message: string;
  readonly suggestion: string;
}

type LeafTransformQueryKindContract<Kind extends LeafOptionsQueryTransformKind> = LeafQueryKindContract & {
  readonly sourceShapePolicy: QueryTransformSourceShapePolicy;
  readonly optionalBooleanOptions?: readonly QueryTransformBooleanOptionPolicy<Kind>[];
};

type LeafTransformQueryKindContractMap = {
  readonly [Kind in LeafOptionsQueryTransformKind]: LeafTransformQueryKindContract<Kind>;
};

export const LEAF_OPTIONS_QUERY_TRANSFORM_CONTRACT_MAP = {
  tokenZones: {
    partition: 'leaf',
    domain: 'zone',
    runtimeShape: 'string',
    sourceShapePolicy: {
      allowedSourceShapes: ['token', 'string'],
      allowUnknownSourceShape: true,
      mismatchDiagnosticCode: 'DOMAIN_TOKEN_ZONES_SOURCE_SHAPE_MISMATCH',
      mismatchSuggestion: 'Use a token-producing query (or a string-token-id source) before tokenZones.',
    },
    optionalBooleanOptions: [
      {
        field: 'dedupe',
        diagnosticCode: 'DOMAIN_TOKEN_ZONES_DEDUPE_INVALID',
        message: 'tokenZones.dedupe must be a boolean when provided.',
        suggestion: 'Set tokenZones.dedupe to true or false.',
      },
    ],
  },
} as const satisfies LeafTransformQueryKindContractMap;

export const OPTIONS_QUERY_KIND_CONTRACT_MAP = {
  concat: { partition: 'recursive' },
  prioritized: { partition: 'recursive' },
  tokenZones: {
    partition: 'leaf',
    domain: LEAF_OPTIONS_QUERY_TRANSFORM_CONTRACT_MAP.tokenZones.domain,
    runtimeShape: LEAF_OPTIONS_QUERY_TRANSFORM_CONTRACT_MAP.tokenZones.runtimeShape,
  },
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
  grantContext: { partition: 'leaf', domain: 'other', runtimeShape: 'unknown' },
  capturedSequenceZones: { partition: 'leaf', domain: 'zone', runtimeShape: 'string' },
} as const satisfies OptionsQueryKindContractMap;

export type LeafOptionsQueryKindFromContractMap = keyof LeafQueryKindContractView<typeof OPTIONS_QUERY_KIND_CONTRACT_MAP>;

export type LeafOptionsQueryKindContractFromMap<
  Kind extends LeafOptionsQueryKindFromContractMap = LeafOptionsQueryKindFromContractMap,
> = LeafQueryKindContractView<typeof OPTIONS_QUERY_KIND_CONTRACT_MAP>[Kind];

export const getLeafOptionsQueryKindContract = <Kind extends LeafOptionsQueryKindFromContractMap>(
  kind: Kind,
): LeafOptionsQueryKindContractFromMap<Kind> => OPTIONS_QUERY_KIND_CONTRACT_MAP[kind];

export const getLeafOptionsQueryTransformContract = <Kind extends LeafOptionsQueryTransformKind>(
  kind: Kind,
): (typeof LEAF_OPTIONS_QUERY_TRANSFORM_CONTRACT_MAP)[Kind] => LEAF_OPTIONS_QUERY_TRANSFORM_CONTRACT_MAP[kind];
