// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './index.js';
import { match, policyTrace, testProbe } from './assertion-test-helpers.js';

describe('guardrailNotFired assertion', () => {
  it('passes when the guardrail fired trace omits the requested id', () => {
    const assertion = { kind: 'guardrailNotFired', guardrail: 'avoid-blunder' } as const;
    const outcome = dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match()] });

    assert.deepEqual(outcome, { kind: 'pass' });
  });

  it('fails when the requested guardrail fired', () => {
    const assertion = { kind: 'guardrailNotFired', guardrail: 'avoid-blunder' } as const;
    const outcome = dispatchAssertion(assertion, {
      probe: testProbe(assertion),
      matches: [match({
        trace: policyTrace({
          guardrails: {
            fired: [{
              id: 'avoid-blunder',
              traceLabel: 'avoid blunder',
              severity: 'warn',
              status: 'ready',
            }],
            notFiredTop: [],
          },
        }),
      })],
    });

    assert.equal(outcome.kind, 'fail');
    assert.match(outcome.kind === 'fail' ? outcome.reason : '', /fired/u);
  });
});
