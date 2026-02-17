import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL tutorial simple event-card production spec', () => {
  it('compiles card 107 (Burning Bonze) with conditional patronage and shaded Saigon shift/aid penalty', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-107');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Burning Bonze');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.factionOrder, ['VC', 'NVA', 'ARVN', 'US']);

    const unshadedIf = card?.unshaded?.effects?.find((effect) => 'if' in effect);
    assert.notEqual(unshadedIf, undefined);
    assert.deepEqual(unshadedIf, {
      if: {
        when: {
          op: '==',
          left: { ref: 'markerState', space: 'saigon:none', marker: 'supportOpposition' },
          right: 'activeSupport',
        },
        then: [{ addVar: { scope: 'global', var: 'patronage', delta: 6 } }],
        else: [{ addVar: { scope: 'global', var: 'patronage', delta: 3 } }],
      },
    });

    const shadedShift = card?.shaded?.effects?.find((effect) => 'shiftMarker' in effect);
    assert.deepEqual(shadedShift, {
      shiftMarker: { space: 'saigon:none', marker: 'supportOpposition', delta: -1 },
    });
    const shadedAid = card?.shaded?.effects?.find((effect) => 'addVar' in effect);
    assert.deepEqual(shadedAid, { addVar: { scope: 'global', var: 'aid', delta: -12 } });
  });

  it('compiles card 43 (Economic Aid) with dual-side branch choices', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-43');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Economic Aid');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');

    assert.deepEqual(
      card?.unshaded?.branches?.map((branch) => branch.id),
      ['return-us-bases-and-aid', 'return-arvn-bases-and-resources'],
    );
    const unshadedAid = card?.unshaded?.branches?.[0]?.effects?.find((effect) => 'addVar' in effect);
    assert.deepEqual(unshadedAid, { addVar: { scope: 'global', var: 'aid', delta: 12 } });
    const unshadedUsReturn = card?.unshaded?.branches?.[0]?.effects?.find((effect) => 'removeByPriority' in effect);
    assert.notEqual(unshadedUsReturn, undefined);
    const unshadedResources = card?.unshaded?.branches?.[1]?.effects?.find((effect) => 'addVar' in effect);
    assert.deepEqual(unshadedResources, { addVar: { scope: 'global', var: 'arvnResources', delta: 6 } });
    const unshadedArvnReturn = card?.unshaded?.branches?.[1]?.effects?.find((effect) => 'removeByPriority' in effect);
    assert.notEqual(unshadedArvnReturn, undefined);

    assert.deepEqual(
      card?.shaded?.branches?.map((branch) => branch.id),
      ['improve-trail-twice', 'improve-trail-and-add-resources'],
    );
    assert.deepEqual(card?.shaded?.branches?.[0]?.effects, [
      { addVar: { scope: 'global', var: 'trail', delta: 1 } },
      { addVar: { scope: 'global', var: 'trail', delta: 1 } },
    ]);
    assert.deepEqual(card?.shaded?.branches?.[1]?.effects, [
      { addVar: { scope: 'global', var: 'trail', delta: 1 } },
      { addVar: { scope: 'global', var: 'nvaResources', delta: 10 } },
    ]);
  });

  it('compiles card 79 (Henry Cabot Lodge) with aid boost and shaded removal/patronage model', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-79');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Henry Cabot Lodge');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');

    assert.deepEqual(card?.unshaded?.effects, [{ addVar: { scope: 'global', var: 'aid', delta: 20 } }]);

    const remove = card?.shaded?.effects?.find((effect) => 'removeByPriority' in effect);
    assert.notEqual(remove, undefined);
    assert.equal(remove?.removeByPriority.budget, 3);
    const patronage = card?.shaded?.effects?.find((effect) => 'addVar' in effect);
    assert.notEqual(patronage, undefined);
    assert.equal(patronage?.addVar.var, 'patronage');
    assert.deepEqual(patronage?.addVar.delta, {
      op: '*',
      left: 2,
      right: {
        op: '-',
        left: 3,
        right: { ref: 'binding', name: '$remainingRemovalBudget' },
      },
    });
  });

  it('compiles card 112 (Colonel Chau) with unshaded police placement and shaded shift/VC placement model', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-112');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Colonel Chau');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');

    const unshadedTarget = card?.unshaded?.targets?.[0];
    assert.equal(unshadedTarget?.selector?.query, 'mapSpaces');
    assert.deepEqual(unshadedTarget?.cardinality, { max: 6 });
    const unshadedPlace = card?.unshaded?.effects?.find((effect) => 'removeByPriority' in effect);
    assert.notEqual(unshadedPlace, undefined);
    assert.equal(unshadedPlace?.removeByPriority.budget, 6);

    const shadedTarget = card?.shaded?.targets?.[0];
    assert.equal(shadedTarget?.selector?.query, 'mapSpaces');
    assert.deepEqual(shadedTarget?.cardinality, { max: 3 });
    const shadedShift = card?.shaded?.effects?.find((effect) => 'shiftMarker' in effect);
    assert.deepEqual(shadedShift, {
      shiftMarker: { space: '$targetProvince', marker: 'supportOpposition', delta: -1 },
    });
    const shadedPlace = card?.shaded?.effects?.find((effect) => 'removeByPriority' in effect);
    assert.notEqual(shadedPlace, undefined);
    assert.equal(shadedPlace?.removeByPriority.budget, 3);
  });
});
