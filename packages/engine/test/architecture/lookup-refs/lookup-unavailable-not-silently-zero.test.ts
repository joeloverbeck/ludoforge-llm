// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { literalExpr, lookupRef, scoreLookupOption } from './lookup-refs-fixture.js';

describe('lookup unavailable noContribution fallback', () => {
  it('omits contribution, records lookup unavailability, and traces the explicit noContribution fallback', () => {
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
      { onUnavailable: 'noContribution' },
    );

    assert.equal(scored.score, 0);
    assert.equal(
      scored.scoreContributions.some((entry) => entry.termId === 'lookup0'),
      false,
    );
    assert.deepEqual([...scored.unknownLookupRefs.entries()], [
      [
        'lookup.policyState.zones.ZoneId.734828891.properties.population',
        'missing',
      ],
    ]);
    assert.deepEqual(scored.lookupFallbackFired, {
      termId: 'lookup0',
      kind: 'noContribution',
    });
  });
});
