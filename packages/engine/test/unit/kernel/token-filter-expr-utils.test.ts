import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  foldTokenFilterExpr,
  isTokenFilterTraversalError,
  tokenFilterBooleanArityError,
  tokenFilterPathSuffix,
  walkTokenFilterExpr,
  walkTokenFilterExprRecovering,
} from '../../../src/kernel/token-filter-expr-utils.js';
import { PREDICATE_OPERATORS } from '../../../src/contracts/index.js';
import type { TokenFilterExpr } from '../../../src/kernel/types.js';

describe('token-filter-expr-utils', () => {
  it('accepts canonical predicate operators from the shared contract', () => {
    for (const op of PREDICATE_OPERATORS) {
      const expr: TokenFilterExpr = { prop: 'id', op, value: 'a' };
      const visited: string[] = [];
      walkTokenFilterExpr(expr, (entry) => {
        if ('prop' in entry) {
          visited.push(entry.op);
        }
      });
      assert.deepEqual(visited, [op]);
    }
  });

  it('builds deterministic token-filter path suffixes', () => {
    assert.equal(
      tokenFilterPathSuffix([
        { kind: 'not' },
        { kind: 'arg', index: 1 },
        { kind: 'not' },
      ]),
      '.arg.args[1].arg',
    );
  });

  it('folds valid token-filter trees in post-order', () => {
    const expr: TokenFilterExpr = {
      op: 'not',
      arg: {
        op: 'and',
        args: [
          { prop: 'id', op: 'eq', value: 'a' },
          { op: 'or', args: [
            { prop: 'faction', op: 'eq', value: 'US' },
            { prop: 'rank', op: 'eq', value: 1 },
          ] },
        ],
      },
    };

    const visited: string[] = [];
    foldTokenFilterExpr(expr, {
      predicate: (predicate) => {
        visited.push(`predicate:${predicate.prop}`);
        return predicate.prop;
      },
      not: () => {
        visited.push('not');
        return 'not';
      },
      and: () => {
        visited.push('and');
        return 'and';
      },
      or: () => {
        visited.push('or');
        return 'or';
      },
    });

    assert.deepEqual(visited, ['predicate:id', 'predicate:faction', 'predicate:rank', 'or', 'and', 'not']);
  });

  it('walks valid token-filter trees in pre-order with deterministic paths', () => {
    const expr: TokenFilterExpr = {
      op: 'or',
      args: [
        { prop: 'id', op: 'eq', value: 'a' },
        { op: 'not', arg: { prop: 'faction', op: 'eq', value: 'US' } },
      ],
    };

    const visited: string[] = [];
    walkTokenFilterExpr(expr, (entry, path) => {
      const node = 'prop' in entry ? `predicate:${entry.prop}` : `op:${entry.op}`;
      visited.push(`${tokenFilterPathSuffix(path)}=${node}`);
    });

    assert.deepEqual(visited, [
      '=op:or',
      '.args[0]=predicate:id',
      '.args[1]=op:not',
      '.args[1].arg=predicate:faction',
    ]);
  });

  it('walkTokenFilterExprRecovering continues across siblings and reports traversal errors deterministically', () => {
    const mixed = {
      op: 'and',
      args: [
        { op: 'or', args: [] },
        { prop: 'id', op: 'eq', value: 'a' },
        { op: 'xor', args: [{ prop: 'id', op: 'eq', value: 'b' }] },
      ],
    } as unknown as TokenFilterExpr;

    const visited: string[] = [];
    const errors: string[] = [];
    walkTokenFilterExprRecovering(
      mixed,
      (entry, path) => {
        const node = 'prop' in entry ? `predicate:${entry.prop}` : `op:${entry.op}`;
        visited.push(`${tokenFilterPathSuffix(path)}=${node}`);
      },
      (error) => {
        errors.push(`${error.context.reason}@${tokenFilterPathSuffix(error.context.path)}`);
      },
    );

    assert.deepEqual(visited, [
      '=op:and',
      '.args[1]=predicate:id',
    ]);
    assert.deepEqual(errors, [
      'empty_args@.args[0]',
      'unsupported_operator@.args[2]',
    ]);
  });

  it('fails closed for unsupported operators in fold and walk', () => {
    const malformed = {
      op: 'xor',
      args: [{ prop: 'id', op: 'eq', value: 'a' }],
    } as unknown as TokenFilterExpr;

    assert.throws(
      () => foldTokenFilterExpr(malformed, {
        predicate: () => true,
        not: () => true,
        and: () => true,
        or: () => true,
      }),
      (error: unknown) => {
        if (!isTokenFilterTraversalError(error)) {
          return false;
        }
        return error.context.reason === 'unsupported_operator' && tokenFilterPathSuffix(error.context.path) === '';
      },
    );

    assert.throws(
      () => walkTokenFilterExpr({
        op: 'and',
        args: [{ op: 'xor', args: [{ prop: 'id', op: 'eq', value: 'a' }] } as unknown as TokenFilterExpr],
      } as TokenFilterExpr, () => {}),
      (error: unknown) => {
        if (!isTokenFilterTraversalError(error)) {
          return false;
        }
        return error.context.reason === 'unsupported_operator'
          && tokenFilterPathSuffix(error.context.path) === '.args[0]';
      },
    );
  });

  it('fails closed for malformed predicate-like nodes in fold and walk', () => {
    const malformed = {
      op: 'and',
      args: [
        { prop: 'id', op: 'eq', value: 'a' },
        { prop: 'faction' },
      ],
    } as unknown as TokenFilterExpr;

    assert.throws(
      () => foldTokenFilterExpr(malformed, {
        predicate: () => true,
        not: () => true,
        and: () => true,
        or: () => true,
      }),
      (error: unknown) => {
        if (!isTokenFilterTraversalError(error)) {
          return false;
        }
        return error.context.reason === 'unsupported_operator'
          && tokenFilterPathSuffix(error.context.path) === '.args[1]';
      },
    );

    assert.throws(
      () => walkTokenFilterExpr(malformed, () => {}),
      (error: unknown) => {
        if (!isTokenFilterTraversalError(error)) {
          return false;
        }
        return error.context.reason === 'unsupported_operator'
          && tokenFilterPathSuffix(error.context.path) === '.args[1]';
      },
    );
  });

  it('fails closed for non-conforming boolean nodes in fold and walk', () => {
    const malformedAnd = { op: 'and' } as unknown as TokenFilterExpr;

    assert.throws(
      () => foldTokenFilterExpr(malformedAnd, {
        predicate: () => true,
        not: () => true,
        and: () => true,
        or: () => true,
      }),
      (error: unknown) => {
        if (!isTokenFilterTraversalError(error)) {
          return false;
        }
        return error.context.reason === 'non_conforming_node';
      },
    );

    assert.throws(
      () => walkTokenFilterExpr(malformedAnd, () => {}),
      (error: unknown) => {
        if (!isTokenFilterTraversalError(error)) {
          return false;
        }
        return error.context.reason === 'non_conforming_node' && tokenFilterPathSuffix(error.context.path) === '';
      },
    );
  });

  it('reports nested paths for malformed fold nodes', () => {
    const malformed = {
      op: 'not',
      arg: {
        op: 'or',
        args: [
          { prop: 'id', op: 'eq', value: 'a' },
          { op: 'and' },
        ],
      },
    } as unknown as TokenFilterExpr;

    assert.throws(
      () => foldTokenFilterExpr(malformed, {
        predicate: () => true,
        not: () => true,
        and: () => true,
        or: () => true,
      }),
      (error: unknown) => {
        if (!isTokenFilterTraversalError(error)) {
          return false;
        }
        return error.context.reason === 'non_conforming_node'
          && tokenFilterPathSuffix(error.context.path) === '.arg.args[1]';
      },
    );
  });

  it('reports nested paths for empty-args boolean nodes in fold and walk', () => {
    const malformed = {
      op: 'not',
      arg: {
        op: 'or',
        args: [
          { prop: 'id', op: 'eq', value: 'a' },
          { op: 'and', args: [] },
        ],
      },
    } as unknown as TokenFilterExpr;

    assert.throws(
      () => foldTokenFilterExpr(malformed, {
        predicate: () => true,
        not: () => true,
        and: () => true,
        or: () => true,
      }),
      (error: unknown) => {
        if (!isTokenFilterTraversalError(error)) {
          return false;
        }
        return error.context.reason === 'empty_args'
          && error.context.op === 'and'
          && tokenFilterPathSuffix(error.context.path) === '.arg.args[1]';
      },
    );

    assert.throws(
      () => walkTokenFilterExpr(malformed, () => {}),
      (error: unknown) => {
        if (!isTokenFilterTraversalError(error)) {
          return false;
        }
        return error.context.reason === 'empty_args'
          && error.context.op === 'and'
          && tokenFilterPathSuffix(error.context.path) === '.arg.args[1]';
      },
    );
  });

  it('exposes deterministic empty-args traversal errors', () => {
    const expr = { op: 'and', args: [] } as unknown as TokenFilterExpr;
    const error = tokenFilterBooleanArityError(expr, 'and');

    assert.equal(isTokenFilterTraversalError(error), true);
    assert.equal(error.context.reason, 'empty_args');
    assert.equal(String(error.context.op), 'and');
    assert.equal(tokenFilterPathSuffix(error.context.path), '');
    assert.match(error.message, /requires at least one expression argument/);
  });
});
