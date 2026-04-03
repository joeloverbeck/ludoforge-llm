import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asTokenId } from '../../../src/kernel/branded.js';
import { tryCompileTokenFilter, type Token, type TokenFilterExpr } from '../../../src/kernel/index.js';
import { compileFitlValidatedGameDef } from '../../helpers/compiled-condition-production-helpers.js';
import { collectTokenFilterExprs } from '../../helpers/token-filter-production-helpers.js';
import { initialState } from '../../../src/kernel/initial-state.js';
import { matchesTokenFilterExpr } from '../../../src/kernel/token-filter.js';

const makeToken = (id: string, props: Token['props']): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props,
});

describe('token-filter compiler', () => {
  it('compiles simple equality predicates', () => {
    const compiled = tryCompileTokenFilter({ prop: 'faction', op: 'eq', value: 'VC' });
    assert.ok(compiled !== null);

    assert.equal(compiled(makeToken('t1', { faction: 'VC' })), true);
    assert.equal(compiled(makeToken('t2', { faction: 'US' })), false);
  });

  it('compiles nested boolean filters with short-circuit behavior', () => {
    const compiled = tryCompileTokenFilter({
      op: 'and',
      args: [
        { prop: 'faction', op: 'eq', value: 'VC' },
        { prop: 'type', op: 'in', value: ['troops', 'base'] },
      ],
    });
    assert.ok(compiled !== null);

    const props = Object.defineProperties(
      { faction: 'US' },
      {
        type: {
          get() {
            throw new Error('compiled token filter should short-circuit');
          },
        },
      },
    ) as Token['props'];

    assert.equal(compiled(makeToken('t1', props)), false);
    assert.equal(compiled(makeToken('t2', { faction: 'VC', type: 'base' })), true);
    assert.equal(compiled(makeToken('t3', { faction: 'VC', type: 'guerrilla' })), false);
  });

  it('returns null for zoneProp filters', () => {
    const compiled = tryCompileTokenFilter({
      field: { kind: 'zoneProp', prop: 'support' },
      op: 'eq',
      value: 'activeOpposition',
    });

    assert.equal(compiled, null);
  });

  it('returns null for tokenZone filters', () => {
    const compiled = tryCompileTokenFilter({
      field: { kind: 'tokenZone' },
      op: 'eq',
      value: 'southVietnam:saigon',
    });

    assert.equal(compiled, null);
  });

  it('returns null for binding-reference values', () => {
    const compiled = tryCompileTokenFilter({
      prop: 'faction',
      op: 'eq',
      value: { _t: 2, ref: 'binding', name: '$faction' },
    });

    assert.equal(compiled, null);
  });

  it('returns null for malformed boolean expression shapes', () => {
    assert.equal(tryCompileTokenFilter({ op: 'and', args: [] } as unknown as TokenFilterExpr), null);
    assert.equal(
      tryCompileTokenFilter({
        op: 'xor',
        args: [{ prop: 'faction', op: 'eq', value: 'VC' }],
      } as unknown as TokenFilterExpr),
      null,
    );
  });

  it('matches the interpreter for a production FITL token-filter corpus', () => {
    const def = compileFitlValidatedGameDef();
    const exprs = collectTokenFilterExprs(def);
    const state = initialState(def, 17).state;
    const tokens = Object.values(state.zones).flat();
    let compiledCount = 0;

    for (const expr of exprs) {
      const compiled = tryCompileTokenFilter(expr);
      if (compiled === null) {
        continue;
      }
      compiledCount += 1;
      for (const token of tokens) {
        assert.equal(
          compiled(token),
          matchesTokenFilterExpr(token, expr),
          `expected compiled parity for token ${String(token.id)}`,
        );
      }
    }

    assert.ok(compiledCount >= 20, `expected at least 20 compilable FITL token filters, saw ${compiledCount}`);
  });
});
