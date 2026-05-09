// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { literalExpr, lookupRef, resolveLookup } from './lookup-refs-fixture.js';

describe('policy lookup refs observer visibility', () => {
  it('keeps owner-visible zone state hidden from non-owner seats', () => {
    const ref = lookupRef('zones', 'ZoneId', literalExpr('private-zone:0'), ['properties', 'population']);

    assert.deepEqual(resolveLookup(ref, 'private-zone:0', 'seatA'), { kind: 'ready', value: 7 });
    assert.deepEqual(resolveLookup(ref, 'private-zone:0', 'seatB'), { kind: 'unavailable', reason: 'hidden' });
  });

  it('reports hidden for per-player variables outside the observer seat', () => {
    const ref = lookupRef('players', 'PlayerId', literalExpr(0), ['variables', 'influence']);

    assert.deepEqual(resolveLookup(ref, 0, 'seatA'), { kind: 'ready', value: 5 });
    assert.deepEqual(resolveLookup(ref, 0, 'seatB'), { kind: 'unavailable', reason: 'hidden' });
  });
});
