import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

describe('texas card animation metadata integration', () => {
  it('compiles selector-driven card animation metadata to concrete game-def roles', () => {
    const { parsed, compiled } = compileTexasProductionSpec();

    assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.notEqual(compiled.gameDef, null);
    const cardAnimation = compiled.gameDef?.cardAnimation;
    assert.notEqual(cardAnimation, undefined);

    assert.equal(cardAnimation?.cardTokenTypeIds.length, 52);
    assert.equal(cardAnimation?.cardTokenTypeIds.every((tokenTypeId) => tokenTypeId.startsWith('card-')), true);

    assert.deepEqual(cardAnimation?.zoneRoles.draw, ['deck:none']);
    assert.deepEqual(cardAnimation?.zoneRoles.shared, ['community:none']);
    assert.deepEqual(cardAnimation?.zoneRoles.burn, ['burn:none']);
    assert.deepEqual(cardAnimation?.zoneRoles.discard, ['muck:none']);
    assert.deepEqual(cardAnimation?.zoneRoles.hand, parsed.doc.metadata?.players.max !== undefined
      ? Array.from({ length: parsed.doc.metadata.players.max }, (_, player) => `hand:${player}`)
      : []);
  });
});
