// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lookupRef, scoreLookupOption } from './lookup-refs-fixture.js';

const optionValueRef = { kind: 'ref' as const, ref: { kind: 'microturnOptionIntrinsic' as const, intrinsic: 'value' as const } };

describe('policy lookup refs dispatch determinism', () => {
  it('dispatches lookup refs through resolved microturn option keys', () => {
    const scored = scoreLookupOption(
      'public-zone:none',
      [lookupRef('zones', 'ZoneId', optionValueRef, ['properties', 'population'])],
    );

    assert.equal(scored.score, 4);
    assert.deepEqual(scored.scoreContributions, [{ termId: 'lookup0', contribution: 4 }]);
    assert.deepEqual([...scored.unknownLookupRefs.entries()], []);
  });

  it('records unknown lookup refs in deterministic ref-id order', () => {
    const scored = scoreLookupOption('missing-zone:none', [
      lookupRef('zones', 'ZoneId', optionValueRef, ['properties', 'zeta']),
      lookupRef('zones', 'ZoneId', optionValueRef, ['properties', 'alpha']),
    ]);

    assert.deepEqual(
      [...scored.unknownLookupRefs.entries()].map(([refId, reason]) => ({ refId, reason })),
      [
        { refId: 'lookup.policyState.zones.ZoneId.1212757921.properties.alpha', reason: 'missing' },
        { refId: 'lookup.policyState.zones.ZoneId.1212757921.properties.zeta', reason: 'missing' },
      ],
    );
  });
});
