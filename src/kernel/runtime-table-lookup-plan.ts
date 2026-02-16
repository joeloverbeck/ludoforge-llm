import type { ResolvedRowPredicate } from './query-predicate.js';
import type { RuntimeTableKeyIndex } from './runtime-table-index.js';

type PredicateScalar = string | number | boolean;

export interface AssetRowsLookupPlan {
  readonly strategy: 'indexed' | 'scan';
  readonly reason: 'tupleEqMatch' | 'noTupleEqMatch' | 'conflictingEqConstraints';
  readonly tuple?: readonly [string, ...string[]];
  readonly candidateCount: number;
}

export interface AssetRowsLookupPlanResult<Row> {
  readonly plan: AssetRowsLookupPlan;
  readonly candidates: readonly Row[];
}

function isPredicateScalar(value: unknown): value is PredicateScalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function encodePredicateScalar(value: PredicateScalar): string {
  if (typeof value === 'string') {
    return `s:${value}`;
  }
  if (typeof value === 'number') {
    return `n:${value}`;
  }
  return `b:${value ? '1' : '0'}`;
}

export function planAssetRowsLookup<Row>(
  resolvedPredicates: readonly ResolvedRowPredicate[],
  keyIndexesByTuple: ReadonlyMap<string, RuntimeTableKeyIndex>,
  fullRows: readonly Row[],
): AssetRowsLookupPlanResult<Row> {
  const eqValuesByField = new Map<string, PredicateScalar>();
  for (const predicate of resolvedPredicates) {
    if (predicate.op !== 'eq' || !isPredicateScalar(predicate.value)) {
      continue;
    }
    const existing = eqValuesByField.get(predicate.field);
    if (existing !== undefined && existing !== predicate.value) {
      return {
        plan: {
          strategy: 'indexed',
          reason: 'conflictingEqConstraints',
          candidateCount: 0,
        },
        candidates: [],
      };
    }
    eqValuesByField.set(predicate.field, predicate.value);
  }

  for (const keyIndex of keyIndexesByTuple.values()) {
    const parts: string[] = [];
    let constrainsTuple = true;
    for (const field of keyIndex.tuple) {
      const value = eqValuesByField.get(field);
      if (value === undefined) {
        constrainsTuple = false;
        break;
      }
      parts.push(encodePredicateScalar(value));
    }
    if (!constrainsTuple) {
      continue;
    }

    const candidates = (keyIndex.rowsByCompositeKey.get(parts.join('\u0002')) ?? []) as readonly Row[];
    return {
      plan: {
        strategy: 'indexed',
        reason: 'tupleEqMatch',
        tuple: keyIndex.tuple,
        candidateCount: candidates.length,
      },
      candidates,
    };
  }

  return {
    plan: {
      strategy: 'scan',
      reason: 'noTupleEqMatch',
      candidateCount: fullRows.length,
    },
    candidates: [...fullRows],
  };
}
