import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getCompiledTokenFilter, type TokenFilterExpr } from '../../../src/kernel/index.js';

describe('compiled token-filter cache', () => {
  it('reuses the compiled function for the same expression reference', () => {
    const expr: TokenFilterExpr = {
      op: 'and',
      args: [
        { prop: 'faction', op: 'eq', value: 'VC' },
        { prop: 'type', op: 'in', value: ['troops', 'base'] },
      ],
    };

    const first = getCompiledTokenFilter(expr);
    const second = getCompiledTokenFilter(expr);

    assert.ok(first !== null);
    assert.equal(first, second);
  });

  it('creates independent cache entries for distinct expression references', () => {
    const firstExpr: TokenFilterExpr = { prop: 'faction', op: 'eq', value: 'VC' };
    const secondExpr: TokenFilterExpr = { prop: 'faction', op: 'eq', value: 'VC' };

    const first = getCompiledTokenFilter(firstExpr);
    const second = getCompiledTokenFilter(secondExpr);

    assert.ok(first !== null);
    assert.ok(second !== null);
    assert.notEqual(first, second);
  });

  it('caches null results for non-compilable expressions', () => {
    const expr: TokenFilterExpr = {
      field: { kind: 'zoneProp', prop: 'support' },
      op: 'eq',
      value: 'activeSupport',
    };

    const first = getCompiledTokenFilter(expr);
    const second = getCompiledTokenFilter(expr);

    assert.equal(first, null);
    assert.equal(second, null);
  });
});
