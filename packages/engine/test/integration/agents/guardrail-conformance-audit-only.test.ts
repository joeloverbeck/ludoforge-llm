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
import { dispatchAssertion } from '../../policy-profile-quality/probes/assertions/index.js';
import { match, policyTrace, testProbe } from '../../policy-profile-quality/probes/assertions/assertion-test-helpers.js';

describe('guardrail conformance: auditOnly severity', () => {
  it('records a probe-visible trace marker without changing candidate scores', () => {
    const def = createGuardrailConformanceDef(createGuardrail({ severity: 'auditOnly' }));
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
      severity: 'auditOnly',
      status: 'ready',
    }]);

    const assertion = { kind: 'guardrailFired', guardrail: 'avoidBadMove' } as const;
    assert.deepEqual(
      dispatchAssertion(assertion, {
        probe: testProbe(assertion),
        matches: [match({ trace: policyTrace({ guardrails: result.metadata.guardrails }) })],
      }),
      { kind: 'pass' },
    );
  });
});
