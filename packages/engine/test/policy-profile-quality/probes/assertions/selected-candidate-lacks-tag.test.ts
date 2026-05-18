// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './index.js';
import { match, testProbe } from './assertion-test-helpers.js';

describe('selectedCandidateLacksTag assertion', () => {
  it('passes when the selected candidate lacks the tag', () => {
    const assertion = { kind: 'selectedCandidateLacksTag', tag: 'govern' } as const;
    assert.deepEqual(dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match({ selectedActionTags: ['train'] })] }), { kind: 'pass' });
  });

  it('fails when the selected candidate has the tag', () => {
    const assertion = { kind: 'selectedCandidateLacksTag', tag: 'govern' } as const;
    assert.equal(dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match({ selectedActionTags: ['govern'] })] }).kind, 'fail');
  });
});
