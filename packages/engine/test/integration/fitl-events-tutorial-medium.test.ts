import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL tutorial medium event-card production spec', () => {
  it('compiles card 55 (Trucks) with trail degradation and Laos/Cambodia scoped removal model', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-55');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Trucks');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'VC', 'US', 'ARVN']);

    // Unshaded: Trail degrades 2 boxes (not 1), NVA selects pieces via chooseN (not removeByPriority)
    const unshadedTrail = card?.unshaded?.effects?.find((effect) => 'addVar' in effect && effect.addVar.var === 'trail');
    assert.deepEqual(unshadedTrail, { addVar: { scope: 'global', var: 'trail', delta: -2 } });
    const unshadedChooseN = card?.unshaded?.effects?.find((effect) => 'chooseN' in effect);
    assert.notEqual(unshadedChooseN, undefined);

    // Shaded: 2 * Trail to both NVA and VC Resources via let binding, base repositioning via forEach
    const shadedLet = card?.shaded?.effects?.find((effect) => 'let' in effect);
    assert.notEqual(shadedLet, undefined);
    const shadedMove = card?.shaded?.effects?.find((effect) => 'forEach' in effect);
    assert.notEqual(shadedMove, undefined);
  });

  it('compiles card 97 (Brinks Hotel) with aid/patronage branches and leader flip using setGlobalMarker', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-97');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Brinks Hotel');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.seatOrder, ['VC', 'US', 'ARVN', 'NVA']);

    const unshadedBranches = card?.unshaded?.branches ?? [];
    assert.deepEqual(
      unshadedBranches.map((branch) => branch.id),
      ['aid-plus-ten-and-flip-leader', 'transfer-patronage-to-aid-and-flip-leader'],
    );
    for (const branch of unshadedBranches) {
      const hasLeaderFlip = branch.effects?.some(
        (effect) =>
          'if' in effect &&
          effect.if.then.some(
            (nested) =>
              'setGlobalMarker' in nested && nested.setGlobalMarker.marker === 'leaderFlipped',
          ),
      );
      assert.equal(hasLeaderFlip, true, `Expected leaderFlipped marker in ${branch.id}`);
    }

    const shadedShift = card?.shaded?.effects?.find((effect) => 'shiftMarker' in effect);
    assert.deepEqual(shadedShift, {
      shiftMarker: { space: '$targetCity', marker: 'supportOpposition', delta: -2 },
    });

    // Terror placement via zoneVar + global counter sync
    const shadedTerror = card?.shaded?.effects?.filter((effect) => 'addVar' in effect);
    assert.equal(shadedTerror?.length, 2, 'Expected 2 addVar effects (zoneVar terrorCount + global counter)');
    const zoneVarTerror = shadedTerror?.find(
      (effect) => effect.addVar.scope === 'zoneVar' && effect.addVar.var === 'terrorCount',
    );
    assert.notEqual(zoneVarTerror, undefined, 'Expected addVar zoneVar terrorCount effect');
    const globalCounter = shadedTerror?.find(
      (effect) => effect.addVar.scope === 'global' && effect.addVar.var === 'terrorSabotageMarkersPlaced',
    );
    assert.notEqual(globalCounter, undefined, 'Expected addVar global terrorSabotageMarkersPlaced effect');
  });

  it('compiles card 75 (Sihanouk) with structured free-operation grants', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-75');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Sihanouk');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'NVA', 'US', 'VC']);

    assert.deepEqual(card?.unshaded?.freeOperationGrants, [
      {
        seat: '1',
        sequence: { chain: 'sihanouk-unshaded-arvn', step: 0 },
        operationClass: 'operation',
        actionIds: ['sweep', 'assault'],
        zoneFilter: {
          op: '==',
          left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
          right: 'cambodia',
        },
      },
    ]);
    assert.deepEqual(card?.shaded?.freeOperationGrants, [
      { seat: '3', sequence: { chain: 'sihanouk-shaded-vc-nva', step: 0 }, operationClass: 'operation' },
      { seat: '2', sequence: { chain: 'sihanouk-shaded-vc-nva', step: 1 }, operationClass: 'operation' },
    ]);
  });

  it('compiles card 51 (301st Supply Bn) with removal model and shaded rollRandom resource gain', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-51');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, '301st Supply Bn');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'VC', 'US', 'ARVN']);

    const unshadedRemoval = card?.unshaded?.effects?.find((effect) => 'removeByPriority' in effect);
    assert.notEqual(unshadedRemoval, undefined);

    const shadedTrail = card?.shaded?.effects?.find((effect) => 'addVar' in effect && effect.addVar.var === 'trail');
    assert.deepEqual(shadedTrail, { addVar: { scope: 'global', var: 'trail', delta: 1 } });

    const shadedRoll = card?.shaded?.effects?.find((effect) => 'rollRandom' in effect);
    assert.notEqual(shadedRoll, undefined);
    if (shadedRoll !== undefined && 'rollRandom' in shadedRoll) {
      assert.equal(shadedRoll.rollRandom.bind, '$dieRoll');
      assert.equal(shadedRoll.rollRandom.min, 1);
      assert.equal(shadedRoll.rollRandom.max, 6);
      assert.deepEqual(shadedRoll.rollRandom.in, [
        {
          addVar: {
            scope: 'global',
            var: 'nvaResources',
            delta: { ref: 'binding', name: '$dieRoll' },
          },
        },
      ]);
    }
  });
});
