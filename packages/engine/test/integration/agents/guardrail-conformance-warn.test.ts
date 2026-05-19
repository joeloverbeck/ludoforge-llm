// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import {
  alphaPlayerId,
  conformanceMoves,
  createConformanceState,
  createGuardrail,
  createGuardrailConformanceDef,
} from './guardrail-conformance-test-fixtures.js';

describe('guardrail conformance: warn severity', () => {
  it('records a trace marker without changing candidate scores', () => {
    const def = createGuardrailConformanceDef(createGuardrail({ severity: 'warn' }));
    const state = createConformanceState(def);

    const result = evaluatePolicyMoveCore({
      def,
      state,
      playerId: alphaPlayerId,
      legalMoves: conformanceMoves.tagged,
      trustedMoveIndex: new Map(),
      rng: { state: state.rng },
      diagnosticsMode: 'enabled',
      traceLevel: 'summary',
    });

    assert.equal(result.kind, 'success');
    assert.equal(result.metadata.candidates.find((candidate) => candidate.actionId === 'badMove')?.score, 0);
    assert.equal(result.metadata.candidates.find((candidate) => candidate.actionId === 'goodMove')?.score, 0);
    assert.deepEqual(result.metadata.guardrails?.fired, [{
      id: 'avoidBadMove',
      traceLabel: 'avoid bad move',
      severity: 'warn',
      status: 'ready',
    }]);
  });
});
