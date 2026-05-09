// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { literalExpr, lookupRef, resolveLookup } from './lookup-refs-fixture.js';

describe('policy lookup refs key type validation', () => {
  it('reports typeMismatch when a key exists in the wrong collection domain', () => {
    assert.deepEqual(
      resolveLookup(lookupRef('tokens', 'TokenId', literalExpr('public-zone:none'), ['properties', 'strength']), 'public-zone:none'),
      { kind: 'unavailable', reason: 'typeMismatch' },
    );
  });

  it('reports typeMismatch for impossible collection/keyType pairs', () => {
    assert.deepEqual(
      resolveLookup(lookupRef('players', 'TokenId', literalExpr(0), ['variables', 'influence']), 0),
      { kind: 'unavailable', reason: 'typeMismatch' },
    );
    assert.deepEqual(
      resolveLookup(lookupRef('globals', 'ZoneId', literalExpr('morale'), ['properties', 'value']), 'morale'),
      { kind: 'unavailable', reason: 'typeMismatch' },
    );
  });
});
