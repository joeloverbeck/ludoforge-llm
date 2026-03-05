import { normalizeIdentifier } from './identifier-utils.js';

declare const NAMED_SET_ID_BRAND: unique symbol;
export type NamedSetId = string & { readonly [NAMED_SET_ID_BRAND]: 'NamedSetId' };

export type CanonicalNamedSets = ReadonlyMap<NamedSetId, readonly string[]>;

export function normalizeNamedSetId(value: string): NamedSetId {
  return normalizeIdentifier(value) as NamedSetId;
}

export function canonicalizeNamedSets(rawNamedSets: Readonly<Record<string, readonly string[]>>): CanonicalNamedSets {
  const namedSets = new Map<NamedSetId, readonly string[]>();
  for (const [rawId, values] of Object.entries(rawNamedSets)) {
    namedSets.set(normalizeNamedSetId(rawId), values);
  }
  return namedSets;
}

export function listCanonicalNamedSetAlternatives(namedSets: CanonicalNamedSets): readonly string[] {
  return [...namedSets.keys()].map((id) => id as string).sort((left, right) => left.localeCompare(right));
}
