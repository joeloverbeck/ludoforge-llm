import type { Diagnostic } from '../kernel/diagnostics.js';
import { SUPPORTED_EFFECT_KINDS } from './effect-kind-registry.js';
import type { CanonicalNamedSets } from './named-set-utils.js';
import type { TypeInferenceContext } from './type-inference.js';

export type ZoneOwnershipKind = 'none' | 'player' | 'mixed';

export interface EffectLoweringContext {
  readonly ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>;
  readonly zoneIdSet?: ReadonlySet<string>;
  readonly bindingScope?: readonly string[];
  readonly freeOperationActionIds?: readonly string[];
  readonly tokenTraitVocabulary?: Readonly<Record<string, readonly string[]>>;
  readonly tokenFilterProps?: readonly string[];
  readonly namedSets?: CanonicalNamedSets;
  readonly typeInference?: TypeInferenceContext;
  readonly seatIds?: readonly string[];
}

export interface EffectLoweringResult<TValue> {
  readonly value: TValue | null;
  readonly diagnostics: readonly Diagnostic[];
}

export const isExecutionContextScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

export const toInternalDecisionId = (path: string): string => `decision:${path}`;
export const EFFECT_KIND_KEYS: ReadonlySet<string> = new Set(SUPPORTED_EFFECT_KINDS as readonly string[]);
export const RESERVED_COMPILER_BINDING_PREFIX = '$__';
export const TRUSTED_COMPILER_BINDING_PREFIXES: readonly string[] = ['$__macro_'];
export type QueryDomainContract = 'agnostic' | 'tokenOnly' | 'zoneOnly';
const AGNOSTIC_QUERY_DOMAIN_CONTRACT: QueryDomainContract = 'agnostic';
export const EFFECT_QUERY_DOMAIN_CONTRACTS = {
  chooseOneOptions: AGNOSTIC_QUERY_DOMAIN_CONTRACT,
  chooseNOptions: AGNOSTIC_QUERY_DOMAIN_CONTRACT,
  forEachOver: AGNOSTIC_QUERY_DOMAIN_CONTRACT,
  reduceOver: AGNOSTIC_QUERY_DOMAIN_CONTRACT,
  evaluateSubsetSource: AGNOSTIC_QUERY_DOMAIN_CONTRACT,
  distributeTokensTokens: 'tokenOnly' as const,
  distributeTokensDestinations: 'zoneOnly' as const,
} as const;
