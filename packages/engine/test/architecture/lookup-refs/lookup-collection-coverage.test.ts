// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { literalExpr, lookupRef, resolveLookup } from './lookup-refs-fixture.js';

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
});
