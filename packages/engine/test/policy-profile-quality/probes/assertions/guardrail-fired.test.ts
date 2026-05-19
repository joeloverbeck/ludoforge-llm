// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './index.js';
import { match, policyTrace, testProbe } from './assertion-test-helpers.js';

describe('guardrailFired assertion', () => {
  it('passes when the guardrail fired trace contains the requested id', () => {
    const assertion = { kind: 'guardrailFired', guardrail: 'avoid-blunder' } as const;
    const outcome = dispatchAssertion(assertion, {
      probe: testProbe(assertion),
      matches: [match({
        trace: policyTrace({
          guardrails: {
            fired: [{
              id: 'avoid-blunder',
              traceLabel: 'avoid blunder',
              severity: 'auditOnly',
              status: 'ready',
            }],
            notFiredTop: [],
          },
        }),
      })],
    });

    assert.deepEqual(outcome, { kind: 'pass' });
  });

  it('fails when the requested guardrail did not fire', () => {
    const assertion = { kind: 'guardrailFired', guardrail: 'avoid-blunder' } as const;
    const outcome = dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match()] });

    assert.equal(outcome.kind, 'fail');
    assert.match(outcome.kind === 'fail' ? outcome.reason : '', /did not fire/u);
  });
});
