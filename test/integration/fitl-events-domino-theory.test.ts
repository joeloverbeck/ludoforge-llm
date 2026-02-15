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
    assert.deepEqual(domino?.tags, []);
    assert.equal(domino?.metadata?.period, '1965');
    assert.deepEqual(domino?.metadata?.factionOrder, ['ARVN', 'VC', 'US', 'NVA']);
    assert.equal(typeof domino?.metadata?.flavorText, 'string');
    assert.equal(typeof domino?.unshaded?.text, 'string');
    assert.equal(typeof domino?.shaded?.text, 'string');
    assert.equal(compiled.gameDef?.eventDecks?.[0]?.drawZone, 'deck:none');
    assert.equal(compiled.gameDef?.eventDecks?.[0]?.discardZone, 'played:none');
    assert.equal(compiled.gameDef?.eventDecks?.[0]?.shuffleOnSetup, true);

    const unshadedBranchIds = domino?.unshaded?.branches?.map((branch) => branch.id);
    assert.deepEqual(unshadedBranchIds, ['return-from-out-of-play', 'resources-and-aid']);

    const returnBranchTargets = domino?.unshaded?.branches?.[0]?.targets;
    assert.deepEqual(returnBranchTargets?.map((target) => target.id), ['us-out-of-play', 'arvn-out-of-play']);
    assert.deepEqual(returnBranchTargets?.map((target) => target.cardinality), [{ max: 3 }, { max: 6 }]);
    const returnBranchEffects = domino?.unshaded?.branches?.[0]?.effects ?? [];
    const usReturn = returnBranchEffects.find((effect) => 'removeByPriority' in effect && effect.removeByPriority.budget === 3);
    const arvnReturn = returnBranchEffects.find((effect) => 'removeByPriority' in effect && effect.removeByPriority.budget === 6);
    assert.notEqual(usReturn, undefined);
    assert.notEqual(arvnReturn, undefined);

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
    assert.ok(cardIds?.includes('card-68'), 'Expected card-68');
    assert.ok(cardIds?.includes('card-82'), 'Expected card-82');
    // Preserve order-field sort: 27 < 68 < 82.
    const idx27 = cardIds!.indexOf('card-27');
    const idx68 = cardIds!.indexOf('card-68');
    const idx82 = cardIds!.indexOf('card-82');
    assert.ok(idx27 < idx68, 'card-27 must appear before card-68 in sorted order');
    assert.ok(idx68 < idx82, 'card-68 must appear before card-82 in sorted order');
  });
});
