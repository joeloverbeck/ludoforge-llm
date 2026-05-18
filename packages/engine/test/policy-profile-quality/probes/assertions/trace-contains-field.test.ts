// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './index.js';
import { match, testProbe } from './assertion-test-helpers.js';

describe('traceContainsField assertion', () => {
  it('passes when a dotted trace field exists', () => {
    const assertion = { kind: 'traceContainsField', field: 'previewUsage.mode' } as const;
    assert.deepEqual(dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match()] }), { kind: 'pass' });
  });

  it('fails when a dotted trace field is absent', () => {
    const assertion = { kind: 'traceContainsField', field: 'missing.field' } as const;
    assert.equal(dispatchAssertion(assertion, { probe: testProbe(assertion), matches: [match()] }).kind, 'fail');
  });
});
