// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './index.js';
import { match, policyTrace, testProbe } from './assertion-test-helpers.js';

describe('traceHasAdvisory assertion', () => {
  it('passes when the advisory is present', () => {
    const assertion = { kind: 'traceHasAdvisory', code: 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE' } as const;
    const trace = policyTrace({ advisories: [{ code: 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE' } as never] });
    assert.deepEqual(dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match({ trace })] }), { kind: 'pass' });
  });

  it('fails when the advisory is absent', () => {
    const assertion = { kind: 'traceHasAdvisory', code: 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE' } as const;
    assert.equal(dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match()] }).kind, 'fail');
  });
});
