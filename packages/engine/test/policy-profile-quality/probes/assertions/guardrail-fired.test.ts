// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './index.js';
import { match, testProbe } from './assertion-test-helpers.js';

describe('guardrailFired assertion', () => {
  it('returns the reserved guardrail error until Spec 183 lands', () => {
    const assertion = { kind: 'guardrailFired', guardrail: 'avoid-blunder' } as const;
    const outcome = dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match()] });
    assert.equal(outcome.kind, 'error');
    assert.match(outcome.kind === 'error' ? outcome.message : '', /requires Spec 183 guardrails/u);
  });
});
