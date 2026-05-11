// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { literalExpr, lookupRef, scoreLookupOption } from './lookup-refs-fixture.js';

describe('lookup unavailable constant fallback', () => {
  it('adds an explicit zero contribution and records lookupFallbackFired', () => {
    const scored = scoreLookupOption(
      'missing-zone:none',
      [
        lookupRef(
          'zones',
          'ZoneId',
          literalExpr('missing-zone:none'),
          ['properties', 'population'],
        ),
      ],
      { onUnavailable: { kind: 'constant', value: 0 } },
    );

    assert.equal(scored.score, 0);
    assert.deepEqual(scored.scoreContributions.find((entry) => entry.termId === 'lookup0'), {
      termId: 'lookup0',
      contribution: 0,
    });
    assert.deepEqual([...scored.unknownLookupRefs.entries()], [
      [
        'lookup.policyState.zones.ZoneId.734828891.properties.population',
        'missing',
      ],
    ]);
    assert.deepEqual(scored.lookupFallbackFired, {
      termId: 'lookup0',
      kind: 'constant',
      value: 0,
    });
  });
});
