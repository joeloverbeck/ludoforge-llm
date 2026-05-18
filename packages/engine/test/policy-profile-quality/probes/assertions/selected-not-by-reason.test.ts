// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './index.js';
import { match, policyTrace, testProbe } from './assertion-test-helpers.js';

describe('selectedNotByReason assertion', () => {
  it('passes when the selected candidate reason differs', () => {
    const assertion = { kind: 'selectedNotByReason', reason: 'tiebreakAfterPreviewNoSignal' } as const;
    assert.deepEqual(dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match()] }), { kind: 'pass' });
  });

  it('fails when the selected candidate reason matches', () => {
    const assertion = { kind: 'selectedNotByReason', reason: 'tiebreakAfterPreviewNoSignal' } as const;
    const trace = policyTrace({ candidates: [{ ...policyTrace().candidates![0]!, selectionReason: 'tiebreakAfterPreviewNoSignal' }] });
    assert.equal(dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match({ trace })] }).kind, 'fail');
  });

  it('supports maxRate over every occurrence', () => {
    const assertion = { kind: 'selectedNotByReason', reason: 'tiebreakAfterPreviewNoSignal', maxRate: 0.5 } as const;
    const badTrace = policyTrace({ candidates: [{ ...policyTrace().candidates![0]!, selectionReason: 'tiebreakAfterPreviewNoSignal' }] });
    assert.deepEqual(dispatchAssertion(assertion, { probe: testProbe(assertion, 'every'), matches: [match(), match({ trace: badTrace })] }), { kind: 'pass' });
  });
});
