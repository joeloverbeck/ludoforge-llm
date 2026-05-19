// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMove, evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import {
  alphaPlayerId,
  createGuardrailFallbackDef,
  createGuardrailFallbackState,
  guardrailFallbackMoves,
} from './guardrail-fallback-test-fixtures.js';

describe('guardrail fallback constructibility failure', () => {
  it('records a non-constructible onAllPruned fallback and returns the policy fallback path', () => {
    const def = createGuardrailFallbackDef();
    const state = createGuardrailFallbackState(def);
    const core = evaluatePolicyMoveCore({
      def,
      state,
      playerId: alphaPlayerId,
      legalMoves: guardrailFallbackMoves.withoutPass,
      trustedMoveIndex: new Map(),
      rng: { state: state.rng },
      diagnosticsMode: 'enabled',
      traceLevel: 'summary',
    });

    assert.equal(core.kind, 'failure');
    assert.equal(core.failure.code, 'PRUNING_RULE_EMPTIED_CANDIDATES');
    assert.equal(core.failure.detail?.signal, 'POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE');
    assert.deepEqual(core.metadata.guardrails?.allPrunedFallback, {
      guardrailId: 'dropEverything',
      actionId: 'pass',
      traceLabel: 'take pass fallback',
      constructibilityFailure: true,
    });

    const fallback = evaluatePolicyMove({
      def,
      state,
      playerId: alphaPlayerId,
      legalMoves: guardrailFallbackMoves.withoutPass,
      trustedMoveIndex: new Map(),
      rng: { state: state.rng },
      diagnosticsMode: 'enabled',
      traceLevel: 'summary',
    });
    assert.deepEqual(fallback.move, { actionId: 'attack', params: {} });
    assert.equal(fallback.metadata.usedFallback, true);
    assert.deepEqual(fallback.metadata.guardrails?.allPrunedFallback, core.metadata.guardrails?.allPrunedFallback);
  });
});
