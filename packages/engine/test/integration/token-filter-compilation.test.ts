// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getCompiledTokenFilter, initialState, matchesTokenFilterExpr } from '../../src/kernel/index.js';
import type { TokenFilterExpr } from '../../src/kernel/index.js';
import { compileFitlValidatedGameDef } from '../helpers/compiled-condition-production-helpers.js';
import { collectTokenFilterExprs } from '../helpers/token-filter-production-helpers.js';

const requiresContext = (expr: TokenFilterExpr): boolean => {
  if ('value' in expr) {
    return !Array.isArray(expr.value) && (typeof expr.value !== 'string' && typeof expr.value !== 'number' && typeof expr.value !== 'boolean');
  }
  if (expr.op === 'not') {
    return requiresContext(expr.arg);
  }
  return expr.args.some(requiresContext);
};

describe('token-filter compilation integration', () => {
  it('keeps the compiled fast path equivalent to the interpreter across FITL initial-state token filters', () => {
    const def = compileFitlValidatedGameDef();
    const exprs = collectTokenFilterExprs(def);
    const tokens = Object.values(initialState(def, 17, 4).state.zones).flat();
    let compiledCount = 0;

    for (const expr of exprs) {
      const compiled = getCompiledTokenFilter(expr);
      if (compiled === null || requiresContext(expr)) {
        continue;
      }
      compiledCount += 1;
      for (const token of tokens) {
        assert.equal(
          compiled(token),
          matchesTokenFilterExpr(token, expr),
          `expected integrated compiled parity for token ${String(token.id)}`,
        );
      }
    }

    assert.ok(compiledCount >= 20, `expected at least 20 compilable FITL token filters, saw ${compiledCount}`);
  });
});
