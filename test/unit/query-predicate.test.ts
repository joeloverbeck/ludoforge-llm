import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isEvalErrorCode } from '../../src/kernel/index.js';
import { filterRowsByPredicates, matchesResolvedPredicate, type ResolvedRowPredicate } from '../../src/kernel/query-predicate.js';

describe('query-predicate', () => {
  it('evaluates eq/neq predicates with strict equality semantics', () => {
    assert.equal(matchesResolvedPredicate('US', { field: 'faction', op: 'eq', value: 'US' }), true);
    assert.equal(matchesResolvedPredicate('US', { field: 'faction', op: 'neq', value: 'NVA' }), true);
    assert.equal(matchesResolvedPredicate('US', { field: 'faction', op: 'eq', value: 'NVA' }), false);
  });

  it('evaluates in/notIn with strict scalar type matching', () => {
    assert.equal(matchesResolvedPredicate(3, { field: 'level', op: 'in', value: [1, 3, 5] }), true);
    assert.equal(matchesResolvedPredicate(3, { field: 'level', op: 'notIn', value: [1, 2] }), true);
  });

  it('rejects in/notIn predicates with non-array values', () => {
    assert.throws(
      () => matchesResolvedPredicate('US', { field: 'faction', op: 'in', value: 'US' }),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('rejects mixed scalar-type membership sets', () => {
    assert.throws(
      () => matchesResolvedPredicate('US', { field: 'faction', op: 'in', value: ['US', 1] }),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('rejects field/set type mismatches for membership operations', () => {
    assert.throws(
      () => matchesResolvedPredicate('3', { field: 'level', op: 'in', value: [1, 2, 3] }),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('filters rows via domain adapter accessors', () => {
    const rows = [
      { id: 'a', score: 1, faction: 'US' },
      { id: 'b', score: 2, faction: 'ARVN' },
      { id: 'c', score: 3, faction: 'NVA' },
    ] as const;

    const predicates: readonly ResolvedRowPredicate[] = [
      { field: 'score', op: 'in', value: [1, 2, 4] },
      { field: 'faction', op: 'notIn', value: ['NVA'] },
    ];

    const filtered = filterRowsByPredicates(rows, predicates, {
      getFieldValue: (row, field) => row[field as keyof typeof row],
    });

    assert.deepEqual(filtered.map((row) => row.id), ['a', 'b']);
  });
});
