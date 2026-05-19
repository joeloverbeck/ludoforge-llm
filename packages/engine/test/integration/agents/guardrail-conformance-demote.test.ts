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
  literal,
} from './guardrail-conformance-test-fixtures.js';

describe('guardrail conformance: demote severity', () => {
  it('subtracts the declared penalty, records trace, and changes ranking', () => {
    const def = createGuardrailConformanceDef(createGuardrail({
      severity: 'demote',
      penalty: literal(20),
    }));
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
    assert.deepEqual(result.move, { actionId: 'goodMove', params: {} });
    assert.equal(result.metadata.candidates.find((candidate) => candidate.actionId === 'badMove')?.score, -20);
    assert.equal(result.metadata.candidates.find((candidate) => candidate.actionId === 'goodMove')?.score, 0);
    assert.deepEqual(result.metadata.guardrails?.fired, [{
      id: 'avoidBadMove',
      traceLabel: 'avoid bad move',
      severity: 'demote',
      penalty: 20,
      status: 'ready',
    }]);
  });
});
