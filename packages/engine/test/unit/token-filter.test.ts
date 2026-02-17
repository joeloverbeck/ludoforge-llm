import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asTokenId } from '../../src/kernel/branded.js';
import {
  filterTokensByPredicates,
  matchesAllTokenFilterPredicates,
  matchesTokenFilterPredicate,
  resolveLiteralTokenFilterValue,
} from '../../src/kernel/token-filter.js';
import type { Token, TokenFilterPredicate } from '../../src/kernel/types.js';

function makeToken(id: string, props: Token['props']): Token {
  return {
    id: asTokenId(id),
    type: 'card',
    props,
  };
}

describe('token-filter', () => {
  it('matches literal token filter predicates and supports id field lookups', () => {
    const token = makeToken('card-1', { suit: 'hearts', rank: 10 });

    assert.equal(matchesTokenFilterPredicate(token, { prop: 'suit', op: 'eq', value: 'hearts' }), true);
    assert.equal(matchesTokenFilterPredicate(token, { prop: 'id', op: 'eq', value: 'card-1' }), true);
    assert.equal(matchesTokenFilterPredicate(token, { prop: 'rank', op: 'in', value: [10, 12] }), true);
    assert.equal(matchesTokenFilterPredicate(token, { prop: 'rank', op: 'notIn', value: [1, 2] }), true);
  });

  it('fails closed for non-literal unresolved values under default resolution', () => {
    const token = makeToken('card-2', { rank: 5 });
    const predicate: TokenFilterPredicate = {
      prop: 'rank',
      op: 'eq',
      value: { ref: 'gvar', var: 'tick' },
    };

    assert.equal(resolveLiteralTokenFilterValue(predicate.value), null);
    assert.equal(matchesTokenFilterPredicate(token, predicate), false);
    assert.equal(matchesAllTokenFilterPredicates(token, [predicate]), false);
  });

  it('supports caller-provided value resolution for dynamic predicates', () => {
    const token = makeToken('card-3', { rank: 7 });
    const predicate: TokenFilterPredicate = {
      prop: 'rank',
      op: 'eq',
      value: { ref: 'gvar', var: 'tick' },
    };

    const resolved = matchesTokenFilterPredicate(token, predicate, (value) =>
      typeof value === 'object' && value !== null && 'ref' in value ? 7 : null,
    );
    assert.equal(resolved, true);
  });

  it('filters token lists by predicate arrays', () => {
    const tokens: readonly Token[] = [
      makeToken('a', { suit: 'hearts' }),
      makeToken('b', { suit: 'clubs' }),
      makeToken('c', { suit: 'hearts' }),
    ];

    const filtered = filterTokensByPredicates(tokens, [{ prop: 'suit', op: 'eq', value: 'hearts' }]);
    assert.deepEqual(filtered.map((token) => token.id), [asTokenId('a'), asTokenId('c')]);
  });
});
