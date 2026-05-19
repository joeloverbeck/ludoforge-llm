// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../src/agents/policy-eval.js';
import {
  alphaPlayerId,
  conformanceMoves,
  createConformanceState,
  createGuardrail,
  createGuardrailConformanceDef,
  literal,
} from '../integration/agents/guardrail-conformance-test-fixtures.js';

const evaluateGuardrailDecision = () => {
  const def = createGuardrailConformanceDef(createGuardrail({
    severity: 'demote',
    penalty: literal(5),
  }));
  const state = createConformanceState(def, 42);
  return evaluatePolicyMoveCore({
    def,
    state,
    playerId: alphaPlayerId,
    legalMoves: conformanceMoves.tagged,
    trustedMoveIndex: new Map(),
    rng: { state: state.rng },
    diagnosticsMode: 'enabled',
    traceLevel: 'summary',
  });
};

describe('guardrail replay determinism', () => {
  it('produces byte-identical decisions and traces across two same-seed evaluations', () => {
    const first = evaluateGuardrailDecision();
    const second = evaluateGuardrailDecision();

    assert.equal(first.kind, 'success');
    assert.equal(second.kind, 'success');
    assert.equal(JSON.stringify(first.move), JSON.stringify(second.move));
    assert.equal(JSON.stringify(first.metadata), JSON.stringify(second.metadata));
  });
});
