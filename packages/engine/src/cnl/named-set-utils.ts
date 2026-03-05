import { normalizeIdentifier } from './identifier-utils.js';
import type { Diagnostic } from '../kernel/diagnostics.js';

declare const NAMED_SET_ID_BRAND: unique symbol;
export type NamedSetId = string & { readonly [NAMED_SET_ID_BRAND]: 'NamedSetId' };

export type CanonicalNamedSets = ReadonlyMap<NamedSetId, readonly string[]>;
export interface NamedSetCanonicalIdCollision {
  readonly canonicalId: NamedSetId;
  readonly rawIds: readonly string[];
}

export interface CanonicalNamedSetsResult {
  readonly namedSets: CanonicalNamedSets;
  readonly collisions: readonly NamedSetCanonicalIdCollision[];
}

export interface NamedSetCollisionDiagnosticsOptions {
  readonly code: string;
  readonly collisions: readonly NamedSetCanonicalIdCollision[];
}

export function normalizeNamedSetId(value: string): NamedSetId {
  return normalizeIdentifier(value) as NamedSetId;
}

export function canonicalizeNamedSetsWithCollisions(
  rawNamedSets: Readonly<Record<string, readonly string[]>>,
): CanonicalNamedSetsResult {
  const namedSets = new Map<NamedSetId, readonly string[]>();
  const rawIdsByCanonical = new Map<NamedSetId, string[]>();

  for (const [rawId, values] of Object.entries(rawNamedSets)) {
    const canonicalId = normalizeNamedSetId(rawId);
    const existingRawIds = rawIdsByCanonical.get(canonicalId);
    if (existingRawIds === undefined) {
      rawIdsByCanonical.set(canonicalId, [rawId]);
      namedSets.set(canonicalId, values);
      continue;
    }
    existingRawIds.push(rawId);
  }

  const collisions: NamedSetCanonicalIdCollision[] = [];
  for (const [canonicalId, rawIds] of rawIdsByCanonical.entries()) {
    if (rawIds.length > 1) {
      collisions.push({
        canonicalId,
        rawIds,
      });
    }
  }

  return { namedSets, collisions };
}

export function canonicalizeNamedSets(rawNamedSets: Readonly<Record<string, readonly string[]>>): CanonicalNamedSets {
  return canonicalizeNamedSetsWithCollisions(rawNamedSets).namedSets;
}

export function listCanonicalNamedSetAlternatives(namedSets: CanonicalNamedSets): readonly string[] {
  return [...namedSets.keys()].map((id) => id as string).sort((left, right) => left.localeCompare(right));
}

export function toNamedSetDiagnosticPath(basePath: string, rawId: string): string {
  return `${basePath}[${JSON.stringify(rawId)}]`;
}

export function toNamedSetCanonicalIdCollisionDiagnostics(
  options: NamedSetCollisionDiagnosticsOptions,
): readonly Diagnostic[] {
  return options.collisions.flatMap((collision) =>
    collision.rawIds.slice(1).map((rawId) => ({
      code: options.code,
      path: toNamedSetDiagnosticPath('doc.metadata.namedSets', rawId),
      severity: 'error' as const,
      message: `metadata.namedSets contains duplicate set ids after normalization: "${collision.canonicalId}".`,
      suggestion: 'Use unique named set ids after trim + NFC normalization.',
    })),
  );
}
