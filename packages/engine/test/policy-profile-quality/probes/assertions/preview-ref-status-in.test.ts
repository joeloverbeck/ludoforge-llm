// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './index.js';
import { match, policyTrace, testProbe } from './assertion-test-helpers.js';

describe('previewRefStatusIn assertion', () => {
  it('passes when the selected candidate preview ref status is allowed', () => {
    const assertion = { kind: 'previewRefStatusIn', ref: 'preview.margin', allowed: ['ready'] } as const;
    const trace = policyTrace({ candidates: [{ ...policyTrace().candidates![0]!, previewRefIds: ['preview.margin'] }] });
    assert.deepEqual(dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match({ trace })] }), { kind: 'pass' });
  });

  it('fails when the selected candidate preview ref status is not allowed', () => {
    const assertion = { kind: 'previewRefStatusIn', ref: 'preview.margin', allowed: ['ready'] } as const;
    const trace = policyTrace({ candidates: [{ ...policyTrace().candidates![0]!, unknownPreviewRefs: [{ refId: 'preview.margin', reason: 'hidden' }] }] });
    assert.equal(dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match({ trace })] }).kind, 'fail');
  });
});
