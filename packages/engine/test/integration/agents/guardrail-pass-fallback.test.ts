// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import {
  alphaPlayerId,
  createGuardrailFallbackDef,
  createGuardrailFallbackState,
  guardrailFallbackMoves,
} from './guardrail-fallback-test-fixtures.js';

describe('guardrail pass fallback', () => {
  it('publishes the declared pass action when a safe prune guardrail removes every candidate', () => {
    const def = createGuardrailFallbackDef();
    const state = createGuardrailFallbackState(def);
    const result = evaluatePolicyMoveCore({
      def,
      state,
      playerId: alphaPlayerId,
      legalMoves: guardrailFallbackMoves.withPass,
      trustedMoveIndex: new Map(),
      rng: { state: state.rng },
      diagnosticsMode: 'enabled',
      traceLevel: 'summary',
    });

    assert.equal(result.kind, 'success');
    assert.deepEqual(result.move, { actionId: 'pass', params: {} });
    assert.equal(result.metadata.selectedReason, 'fallbackExplicit');
    assert.deepEqual(result.metadata.guardrails?.allPrunedFallback, {
      guardrailId: 'dropEverything',
      actionId: 'pass',
      traceLabel: 'take pass fallback',
    });
    assert.deepEqual(result.metadata.guardrails?.fired, [{
      id: 'dropEverything',
      traceLabel: 'drop everything',
      severity: 'prune',
      status: 'ready',
    }]);
  });
});
