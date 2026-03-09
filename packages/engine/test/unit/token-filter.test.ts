import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asTokenId } from '../../src/kernel/branded.js';
import { isEvalErrorCode } from '../../src/kernel/eval-error.js';
import { tokenFilterPathSuffix } from '../../src/kernel/token-filter-expr-utils.js';
import {
  filterTokensByExpr,
  matchesTokenFilterExpr,
  matchesTokenFilterPredicate,
  resolveLiteralTokenFilterValue,
} from '../../src/kernel/token-filter.js';
import type { Token, TokenFilterExpr, TokenFilterPredicate } from '../../src/kernel/types.js';

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
    assert.equal(matchesTokenFilterExpr(token, { op: 'and', args: [predicate] }), false);
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

  it('supports caller-provided set resolution for membership predicates', () => {
    const token = makeToken('card-4', { faction: 'ARVN' });
    const predicate: TokenFilterPredicate = {
      prop: 'faction',
      op: 'in',
      value: { ref: 'binding', name: '$targetFactions' },
    };

    const resolved = matchesTokenFilterPredicate(token, predicate, (value) =>
      typeof value === 'object' && value !== null && 'ref' in value ? ['ARVN', 'US'] : null,
    );
    assert.equal(resolved, true);
  });

  it('filters token lists by expression filters', () => {
    const tokens: readonly Token[] = [
      makeToken('a', { suit: 'hearts' }),
      makeToken('b', { suit: 'clubs' }),
      makeToken('c', { suit: 'hearts' }),
    ];

    const filtered = filterTokensByExpr(tokens, {
      op: 'or',
      args: [
        { prop: 'suit', op: 'eq', value: 'hearts' },
        { op: 'not', arg: { prop: 'suit', op: 'eq', value: 'clubs' } },
      ],
    });
    assert.deepEqual(filtered.map((token) => token.id), [asTokenId('a'), asTokenId('c')]);
  });

  it('evaluates nested and/or/not token-filter trees', () => {
    const token = makeToken('a', { suit: 'hearts', rank: 10, elite: false });
    const expression = {
      op: 'or' as const,
      args: [
        {
          op: 'and' as const,
          args: [
            { prop: 'suit', op: 'eq' as const, value: 'clubs' },
            { prop: 'rank', op: 'eq' as const, value: 10 },
          ],
        },
        {
          op: 'not' as const,
          arg: {
            op: 'and' as const,
            args: [
              { prop: 'elite', op: 'eq' as const, value: true },
              { prop: 'rank', op: 'eq' as const, value: 10 },
            ],
          },
        },
      ],
    } as TokenFilterExpr;

    assert.equal(matchesTokenFilterExpr(token, expression), true);
  });

  it('rejects zero-arity boolean token filter expressions', () => {
    const token = makeToken('a', { suit: 'hearts' });

    assert.throws(
      () => matchesTokenFilterExpr(token, { op: 'and', args: [] } as unknown as TokenFilterExpr),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'empty_args'
          && error.context?.op === 'and'
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '';
      },
    );
    assert.throws(
      () => matchesTokenFilterExpr(token, { op: 'or', args: [] } as unknown as TokenFilterExpr),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'empty_args'
          && error.context?.op === 'or'
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '';
      },
    );
  });

  it('preserves nested traversal paths for zero-arity token filter expressions', () => {
    const token = makeToken('a', { suit: 'hearts' });
    const nested = {
      op: 'not',
      arg: {
        op: 'or',
        args: [
          { prop: 'suit', op: 'eq', value: 'hearts' },
          { op: 'and', args: [] },
        ],
      },
    } as unknown as TokenFilterExpr;

    assert.throws(
      () => matchesTokenFilterExpr(token, nested),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'empty_args'
          && error.context?.op === 'and'
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '.arg.args[1]';
      },
    );
  });

  it('fails closed for unsupported token filter operators', () => {
    const token = makeToken('a', { suit: 'hearts' });
    const malformed = {
      op: 'xor',
      args: [{ prop: 'suit', op: 'eq', value: 'hearts' }],
    } as unknown as TokenFilterExpr;

    assert.throws(
      () => matchesTokenFilterExpr(token, malformed),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'unsupported_operator'
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '';
      },
    );
  });

  it('fails closed for unsupported token filter predicate operators', () => {
    const token = makeToken('a', { suit: 'hearts' });
    const malformed = {
      op: 'and',
      args: [{ prop: 'suit', op: 'xor', value: ['hearts'] }],
    } as unknown as TokenFilterExpr;

    assert.throws(
      () => matchesTokenFilterExpr(token, malformed),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('reports nested paths for malformed predicate-like token filter nodes', () => {
    const token = makeToken('a', { suit: 'hearts' });
    const malformed = {
      op: 'and',
      args: [
        { prop: 'suit', op: 'eq', value: 'hearts' },
        { prop: 'rank' },
      ],
    } as unknown as TokenFilterExpr;

    assert.throws(
      () => matchesTokenFilterExpr(token, malformed),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'unsupported_operator'
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '.args[1]';
      },
    );
  });
});
