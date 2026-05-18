// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './index.js';
import { match, testProbe } from './assertion-test-helpers.js';

describe('actionFamilyDistributionBelow assertion', () => {
  it('passes when dominant family rate is below threshold', () => {
    const assertion = { kind: 'actionFamilyDistributionBelow', family: 'any', threshold: 0.75, windowMinDecisions: 4 } as const;
    const matches = [
      match({ selectedActionTags: ['govern'] }),
      match({ selectedActionTags: ['train'] }),
      match({ selectedActionTags: ['train'] }),
      match({ selectedActionTags: ['patrol'] }),
    ];
    assert.deepEqual(dispatchAssertion(assertion, { probe: testProbe(assertion, 'every'), matches }), { kind: 'pass' });
  });

  it('fails when named family rate reaches threshold', () => {
    const assertion = { kind: 'actionFamilyDistributionBelow', family: { tags: ['govern'] }, threshold: 0.5, windowMinDecisions: 2 } as const;
    assert.equal(dispatchAssertion(assertion, {
      probe: testProbe(assertion, 'every'),
      matches: [match({ selectedActionTags: ['govern'] }), match({ selectedActionTags: ['train'] })],
    }).kind, 'fail');
  });

  it('reports insufficient decisions when the window is short', () => {
    const assertion = { kind: 'actionFamilyDistributionBelow', family: 'any', threshold: 0.5, windowMinDecisions: 3 } as const;
    const outcome = dispatchAssertion(assertion, { probe: testProbe(assertion, 'every'), matches: [match()] });
    assert.equal(outcome.kind, 'error');
    assert.match(outcome.kind === 'error' ? outcome.message : '', /insufficient decisions: 1 < 3/u);
  });
});
