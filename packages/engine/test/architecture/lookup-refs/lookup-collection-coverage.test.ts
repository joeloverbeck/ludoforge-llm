// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canonicalCookbookProfile,
  literalExpr,
  lookupRef,
  resolveLookup,
  scoreCanonicalCookbookProfile,
} from './lookup-refs-fixture.js';

describe('policy lookup refs collection coverage', () => {
  it('resolves zones, tokens, players, and globals through the generic lookup surface', () => {
    assert.deepEqual(
      resolveLookup(lookupRef('zones', 'ZoneId', literalExpr('public-zone:none'), ['properties', 'population']), 'public-zone:none'),
      { kind: 'ready', value: 4 },
    );
    assert.deepEqual(
      resolveLookup(lookupRef('tokens', 'TokenId', literalExpr('unit-public'), ['properties', 'strength']), 'unit-public'),
      { kind: 'ready', value: 3 },
    );
    assert.deepEqual(
      resolveLookup(lookupRef('players', 'PlayerId', literalExpr(0), ['variables', 'influence']), 0),
      { kind: 'ready', value: 5 },
    );
    assert.deepEqual(
      resolveLookup(lookupRef('globals', 'string', literalExpr('morale'), ['properties', 'value']), 'morale'),
      { kind: 'ready', value: 9 },
    );
  });

  it('exercises the canonical cookbook profile across all four lookup collections', () => {
    const profile = canonicalCookbookProfile();
    assert.deepEqual(profile.considerationIds, ['lookup0', 'lookup1', 'lookup2', 'lookup3']);
    assert.deepEqual(profile.refs.map((ref) => ref.collection), ['zones', 'tokens', 'players', 'globals']);

    const scored = scoreCanonicalCookbookProfile();
    assert.deepEqual(scored.scoreContributions, [
      { termId: 'lookup0', contribution: 4 },
      { termId: 'lookup1', contribution: 3 },
      { termId: 'lookup2', contribution: 5 },
      { termId: 'lookup3', contribution: 9 },
    ]);
    assert.deepEqual([...scored.unknownLookupRefs.entries()], []);
    assert.equal(scored.lookupFallbackFired, undefined);
  });
});
