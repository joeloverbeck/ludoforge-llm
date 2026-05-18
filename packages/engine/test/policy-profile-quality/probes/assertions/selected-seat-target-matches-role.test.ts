// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './index.js';
import { actionDecision, match, policyTrace, testProbe } from './assertion-test-helpers.js';

describe('selectedSeatTargetMatchesRole assertion', () => {
  it('passes when selected target matches the traced role seat', () => {
    const assertion = { kind: 'selectedSeatTargetMatchesRole', role: 'currentLeader' } as const;
    const trace = policyTrace({ stateFeatures: { standingRole: { currentLeader: 'NVA' } } as never });
    assert.deepEqual(dispatchAssertion(assertion, {
      probe: testProbe(assertion),
      matches: [match({ selectedDecision: actionDecision('attack', { targetSeat: 'NVA' }), trace })],
    }), { kind: 'pass' });
  });

  it('fails when selected target differs from the traced role seat', () => {
    const assertion = { kind: 'selectedSeatTargetMatchesRole', role: 'currentLeader' } as const;
    const trace = policyTrace({ stateFeatures: { standingRole: { currentLeader: 'NVA' } } as never });
    assert.equal(dispatchAssertion(assertion, {
      probe: testProbe(assertion),
      matches: [match({ selectedDecision: actionDecision('attack', { targetSeat: 'ARVN' }), trace })],
    }).kind, 'fail');
  });
});
