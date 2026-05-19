// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext } from '../../../src/agents/policy-evaluation-core.js';
import { asPlayerId, type CompiledPolicyExpr } from '../../../src/kernel/index.js';
import {
  createCandidate,
  createInitialStrategyModuleState,
  createStrategyModuleGameDef,
  moduleRef,
} from './strategy-module-test-fixtures.js';

const contributionRef = moduleRef('buildEngine', {
  kind: 'strategyModule',
  moduleId: 'buildEngine',
  field: 'contribution',
}) as CompiledPolicyExpr;

describe('strategy module activation caching', () => {
  it('evaluates state-scoped activation once per decision while resolving per-candidate contribution', () => {
    const def = createStrategyModuleGameDef();
    const state = createInitialStrategyModuleState(def);
    const catalog = def.agents!;
    const candidates = [
      ...Array.from({ length: 100 }, (_entry, index) => createCandidate('goodMove', index)),
      createCandidate('badMove', 100),
    ];
    const context = new PolicyEvaluationContext({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog,
      parameterValues: {},
      trustedMoveIndex: new Map(),
    }, candidates);

    try {
      context.evaluatePlannedStrategyModule('buildEngine');

      for (const candidate of candidates) {
        context.evaluateCompiledExpr(contributionRef, candidate);
      }

      assert.equal(context.getEvaluatedStrategyModuleActivationCacheSize(), 1);
      assert.equal(context.evaluateCompiledExpr(contributionRef, candidates[0]), 7);
      assert.equal(context.evaluateCompiledExpr(contributionRef, candidates.at(-1)), 0);
    } finally {
      context.dispose();
    }
  });
});
