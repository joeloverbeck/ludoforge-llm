// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './probes/assertions/index.js';
import { match, policyTrace, testProbe } from './probes/assertions/assertion-test-helpers.js';

const assertion = {
  kind: 'guardrailFiresUniformAcross',
  guardrail: 'constant-shift',
  threshold: 1,
  windowMinDecisions: 3,
} as const;

describe('guardrail uniform-fire profile-quality lint', () => {
  it('reports POLICY_PROFILE_QUALITY_GUARDRAIL_FIRES_UNIFORM when a demote guardrail fires on every observed decision', () => {
    const outcome = dispatchAssertion(assertion, {
      probe: testProbe(assertion, 'every'),
      matches: [
        guardrailMatch(true),
        guardrailMatch(true),
        guardrailMatch(true),
      ],
    });

    assert.equal(outcome.kind, 'fail');
    assert.match(outcome.kind === 'fail' ? outcome.reason : '', /POLICY_PROFILE_QUALITY_GUARDRAIL_FIRES_UNIFORM/u);
  });

  it('does not report when a demote guardrail fires selectively', () => {
    const outcome = dispatchAssertion(assertion, {
      probe: testProbe(assertion, 'every'),
      matches: [
        guardrailMatch(true),
        guardrailMatch(false),
        guardrailMatch(true),
      ],
    });

    assert.deepEqual(outcome, { kind: 'pass' });
  });
});

const guardrailMatch = (fired: boolean) => match({
  trace: policyTrace({
    guardrails: {
      fired: fired
        ? [{
            id: 'constant-shift',
            traceLabel: 'constant shift',
            severity: 'demote',
            penalty: 10,
            status: 'ready',
          }]
        : [],
      notFiredTop: fired
        ? []
        : [{ id: 'constant-shift', reason: 'whenFalse' }],
      },
  }),
});
