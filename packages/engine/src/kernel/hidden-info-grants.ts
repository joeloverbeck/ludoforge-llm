import type { PlayerId } from './branded.js';
import type { RevealGrant, TokenFilterPredicate } from './types.js';

type GrantObservers = 'all' | readonly PlayerId[];

interface RevealGrantRemovalCriteria {
  readonly from?: GrantObservers;
  readonly filterKey?: string | null;
}

interface RevealGrantRemovalResult {
  readonly remaining: readonly RevealGrant[];
  readonly removedCount: number;
}

const compareStrings = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

const canonicalizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeValue(entry));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const ordered: Record<string, unknown> = {};
    Object.keys(record).sort(compareStrings).forEach((key) => {
      ordered[key] = canonicalizeValue(record[key]);
    });
    return ordered;
  }
  return value;
};

const canonicalPredicateKey = (predicate: TokenFilterPredicate): string => JSON.stringify(canonicalizeValue(predicate));

export const normalizeObservers = (players: readonly PlayerId[]): readonly PlayerId[] => (
  [...new Set(players)].sort((left, right) => left - right)
);

export const canonicalizeObserverSelection = (
  players: readonly PlayerId[],
  playerCount: number,
): GrantObservers => {
  const normalized = normalizeObservers(players);
  return normalized.length === playerCount ? 'all' : normalized;
};

export const observersEqual = (left: GrantObservers, right: GrantObservers): boolean => {
  if (left === 'all' || right === 'all') {
    return left === right;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
};

export const canonicalizeTokenFilterPredicates = (
  predicates?: readonly TokenFilterPredicate[],
): readonly TokenFilterPredicate[] | undefined => {
  if (predicates === undefined) {
    return undefined;
  }
  return [...predicates]
    .map((predicate) => ({ key: canonicalPredicateKey(predicate), predicate }))
    .sort((left, right) => compareStrings(left.key, right.key))
    .map((entry) => entry.predicate);
};

export const canonicalTokenFilterKey = (predicates?: readonly TokenFilterPredicate[]): string => {
  if (predicates === undefined) {
    return 'null';
  }
  return JSON.stringify(canonicalizeTokenFilterPredicates(predicates));
};

export const revealGrantFilterKey = (grant: Pick<RevealGrant, 'filter'>): string => canonicalTokenFilterKey(grant.filter);

export const revealGrantEquals = (left: RevealGrant, right: RevealGrant): boolean => {
  return observersEqual(left.observers, right.observers) && revealGrantFilterKey(left) === revealGrantFilterKey(right);
};

export const removeMatchingRevealGrants = (
  grants: readonly RevealGrant[],
  criteria: RevealGrantRemovalCriteria,
): RevealGrantRemovalResult => {
  const shouldRemoveEverything = criteria.from === undefined && criteria.filterKey == null;
  const remaining = shouldRemoveEverything
    ? []
    : grants.filter((grant) => {
      if (criteria.from !== undefined && !observersEqual(grant.observers, criteria.from)) {
        return true;
      }
      if (criteria.filterKey != null && revealGrantFilterKey(grant) !== criteria.filterKey) {
        return true;
      }
      return false;
    });

  return {
    remaining,
    removedCount: grants.length - remaining.length,
  };
};

