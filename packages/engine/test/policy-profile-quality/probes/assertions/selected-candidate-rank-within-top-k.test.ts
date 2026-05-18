// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './index.js';
import { match, policyTrace, testProbe } from './assertion-test-helpers.js';

describe('selectedCandidateRankWithinTopK assertion', () => {
  it('passes when the selected candidate rank is within k', () => {
    const assertion = { kind: 'selectedCandidateRankWithinTopK', k: 2 } as const;
    const trace = policyTrace({ selectedStableMoveKey: 'move:b', candidates: [
      ...policyTrace().candidates!,
      { ...policyTrace().candidates![0]!, stableMoveKey: 'move:b' },
    ] });
    assert.deepEqual(dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match({ trace })] }), { kind: 'pass' });
  });

  it('fails when the selected candidate rank exceeds k', () => {
    const assertion = { kind: 'selectedCandidateRankWithinTopK', k: 1 } as const;
    const trace = policyTrace({ selectedStableMoveKey: 'move:b', candidates: [
      ...policyTrace().candidates!,
      { ...policyTrace().candidates![0]!, stableMoveKey: 'move:b' },
    ] });
    assert.equal(dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match({ trace })] }).kind, 'fail');
  });
});
