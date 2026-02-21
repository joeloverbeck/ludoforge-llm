import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL Phoenix Program event-card production spec', () => {
  it('compiles card 27 with dual-use sides and qualifier/cardinality constraints for constrained stages', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const phoenix = compiled.gameDef?.eventDecks?.[0]?.cards.find((card) => card.id === 'card-27');
    assert.notEqual(phoenix, undefined);
    assert.equal(phoenix?.title, 'Phoenix Program');
    assert.equal(phoenix?.sideMode, 'dual');
    assert.deepEqual(phoenix?.tags, []);
    assert.equal(phoenix?.metadata?.period, '1968');
    assert.deepEqual(phoenix?.metadata?.seatOrder, ['US', 'VC', 'ARVN', 'NVA']);
    assert.equal(typeof phoenix?.metadata?.flavorText, 'string');
    assert.equal(typeof phoenix?.unshaded?.text, 'string');
    assert.equal(typeof phoenix?.shaded?.text, 'string');

    const unshadedTarget = phoenix?.unshaded?.targets?.[0];
    assert.equal(unshadedTarget?.id, 'vc-in-coin-control');
    assert.deepEqual(unshadedTarget?.cardinality, { max: 3 });
    assert.deepEqual(unshadedTarget?.selector, {
      query: 'players',
    });

    const shadedTarget = phoenix?.shaded?.targets?.[0];
    assert.equal(shadedTarget?.id, 'terror-spaces');
    assert.deepEqual(shadedTarget?.cardinality, { max: 2 });
    assert.deepEqual(shadedTarget?.selector, {
      query: 'mapSpaces',
    });

    assert.deepEqual(phoenix?.shaded?.effects, [
      { addVar: { scope: 'global', var: 'aid', delta: -2 } },
      { addVar: { scope: 'global', var: 'arvnResources', delta: -1 } },
    ]);

    assert.deepEqual(phoenix?.unshaded?.effects, [{ addVar: { scope: 'global', var: 'aid', delta: -1 } }]);
  });
});
