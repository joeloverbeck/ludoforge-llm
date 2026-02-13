import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL Domino Theory event-card production spec', () => {
  it('compiles card 82 with deterministic branch ordering and constrained declarative targets', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const domino = compiled.gameDef?.eventDecks?.[0]?.cards.find((card) => card.id === 'card-82');
    assert.notEqual(domino, undefined);
    assert.equal(domino?.title, 'Domino Theory');
    assert.equal(domino?.sideMode, 'dual');
    assert.equal(compiled.gameDef?.eventDecks?.[0]?.drawZone, 'leader:none');
    assert.equal(compiled.gameDef?.eventDecks?.[0]?.discardZone, 'played:none');
    assert.equal(compiled.gameDef?.eventDecks?.[0]?.shuffleOnSetup, true);

    const unshadedBranchIds = domino?.unshaded?.branches?.map((branch) => branch.id);
    assert.deepEqual(unshadedBranchIds, ['return-from-out-of-play', 'resources-and-aid']);

    const returnBranchTargets = domino?.unshaded?.branches?.[0]?.targets;
    assert.deepEqual(returnBranchTargets?.map((target) => target.id), ['us-out-of-play', 'arvn-out-of-play']);
    assert.deepEqual(returnBranchTargets?.map((target) => target.cardinality), [{ max: 3 }, { max: 6 }]);

    const shadedTargets = domino?.shaded?.targets;
    assert.equal(shadedTargets?.[0]?.id, 'us-troops-available');
    assert.deepEqual(shadedTargets?.[0]?.cardinality, { max: 3 });

    const shadedAidEffect = domino?.shaded?.effects?.find((effect) => 'addVar' in effect);
    assert.deepEqual(shadedAidEffect, {
      addVar: { scope: 'global', var: 'aid', delta: -9 },
    });
  });

  it('keeps deterministic event-card ordering', () => {
    const { compiled } = compileProductionSpec();

    const cardIds = compiled.gameDef?.eventDecks?.[0]?.cards.map((card) => card.id);
    assert.ok(cardIds?.includes('card-27'), 'Expected card-27');
    assert.ok(cardIds?.includes('card-82'), 'Expected card-82');
    // card-27 has order 27, card-82 has order 82 — card-27 should come first
    const idx27 = cardIds!.indexOf('card-27');
    const idx82 = cardIds!.indexOf('card-82');
    assert.ok(idx27 < idx82, 'card-27 must appear before card-82 in sorted order');
  });
});
