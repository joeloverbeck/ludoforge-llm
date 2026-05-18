// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './index.js';
import { match, testProbe } from './assertion-test-helpers.js';

describe('selectedTargetSatisfiesSelector assertion', () => {
  it('returns the reserved selector error until selectors land', () => {
    const assertion = { kind: 'selectedTargetSatisfiesSelector', selector: 'target-quality' } as const;
    const outcome = dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match()] });
    assert.equal(outcome.kind, 'error');
    assert.match(outcome.kind === 'error' ? outcome.message : '', /requires Spec 181 ticket 006 selectors/u);
  });
});
