// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { match, testProbe } from './assertion-test-helpers.js';
import { evaluatePublishedFrontierConstructible } from './published-frontier-constructible.js';

describe('publishedFrontierConstructible assertion', () => {
  it('passes when every recorded published decision is constructible', () => {
    const assertion = { kind: 'publishedFrontierConstructible' } as const;
    const outcome = evaluatePublishedFrontierConstructible({
      probe: testProbe(assertion, 'every'),
      assertion,
      matches: [
        match({
          publishedFrontierConstructibility: {
            total: 2,
            passed: 2,
            failures: [],
          },
        }),
      ],
    });

    assert.equal(outcome.kind, 'pass');
  });

  it('fails when any published decision cannot be applied through the public path', () => {
    const assertion = { kind: 'publishedFrontierConstructible' } as const;
    const outcome = evaluatePublishedFrontierConstructible({
      probe: testProbe(assertion, 'every'),
      assertion,
      matches: [
        match({
          publishedFrontierConstructibility: {
            total: 2,
            passed: 1,
            failures: [{ index: 1, decisionKind: 'actionSelection', reason: 'synthetic denial' }],
          },
        }),
      ],
    });

    assert.equal(outcome.kind, 'fail');
    assert.match(outcome.kind === 'fail' ? outcome.reason : '', /synthetic denial/u);
  });

  it('errors when configured for a partial frontier occurrence', () => {
    const assertion = { kind: 'publishedFrontierConstructible' } as const;
    const outcome = evaluatePublishedFrontierConstructible({
      probe: testProbe(assertion, 'first'),
      assertion,
      matches: [],
    });

    assert.equal(outcome.kind, 'error');
    assert.match(outcome.kind === 'error' ? outcome.message : '', /requires occurrence "every"/u);
  });
});
