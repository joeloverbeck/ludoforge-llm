// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createGameDefRuntime,
  forkGameDefRuntimeForRun,
  getCompiledQueryPlan,
  initialState,
  matchesTokenFilterExpr,
  type TokenFilterExpr,
} from '../../src/kernel/index.js';
import { compileFitlValidatedGameDef } from '../helpers/compiled-condition-production-helpers.js';
import { collectTokenFilterExprs } from '../helpers/token-filter-production-helpers.js';

const requiresContext = (expr: TokenFilterExpr): boolean => {
  if ('value' in expr) {
    return !Array.isArray(expr.value)
      && typeof expr.value !== 'string'
      && typeof expr.value !== 'number'
      && typeof expr.value !== 'boolean';
  }
  if (expr.op === 'not') {
    return requiresContext(expr.arg);
  }
  return expr.args.some(requiresContext);
};

describe('compiled query plan equivalence', () => {
  it('keeps query/filter plans on the shared structural runtime cache', () => {
    const def = compileFitlValidatedGameDef();
    const runtime = createGameDefRuntime(def);
    const forked = forkGameDefRuntimeForRun(runtime);
    const expr = collectTokenFilterExprs(def).find((candidate) => !requiresContext(candidate));
    assert.ok(expr !== undefined, 'expected at least one context-independent FITL token filter');

    const first = getCompiledQueryPlan(runtime.compiledQueryPlanCache, expr);
    const second = getCompiledQueryPlan(forked.compiledQueryPlanCache, expr);

    assert.ok(first !== null, 'expected FITL token filter to compile');
    assert.equal(first, second);
    assert.equal(runtime.compiledQueryPlanCache, forked.compiledQueryPlanCache);
  });

  it('matches interpreter results across the FITL canary token-filter corpus', () => {
    const def = compileFitlValidatedGameDef();
    const runtime = createGameDefRuntime(def);
    const exprs = collectTokenFilterExprs(def);
    const tokens = Object.values(initialState(def, 17, 4, undefined, runtime).state.zones).flat();
    let compiledCount = 0;

    for (const expr of exprs) {
      if (requiresContext(expr)) {
        continue;
      }
      const plan = getCompiledQueryPlan(runtime.compiledQueryPlanCache, expr);
      if (plan === null) {
        continue;
      }
      compiledCount += 1;
      for (const token of tokens) {
        assert.equal(
          plan(token),
          matchesTokenFilterExpr(token, expr),
          `expected compiled plan parity for token ${String(token.id)}`,
        );
      }
    }

    assert.ok(compiledCount >= 20, `expected at least 20 compilable FITL token filters, saw ${compiledCount}`);
  });
});
