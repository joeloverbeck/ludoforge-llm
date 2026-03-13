import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { findDeep } from '../helpers/ast-search-helpers.js';

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
    const unshadedChooseN = findDeep(card?.unshaded?.effects ?? [], (node) => typeof node?.chooseN?.bind === 'string');
    assert.equal(unshadedChooseN.length, 2, 'Expected nested Laos and Cambodia chooseN removals');

    // Shaded: 2 * Trail to both NVA and VC Resources via let binding, base repositioning via staging + forEach
    const shadedLet = card?.shaded?.effects?.find((effect) => 'let' in effect);
    assert.notEqual(shadedLet, undefined);
    const shadedMove = findDeep(card?.shaded?.effects ?? [], (node) => node?.forEach?.over?.query === 'tokensInZone');
    assert.equal(shadedMove.length >= 1, true);
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

    const shadedShift = card?.shaded?.targets?.[0]?.effects?.find((effect) => 'shiftMarker' in effect);
    assert.deepEqual(shadedShift, {
      shiftMarker: { space: '$targetCity', marker: 'supportOpposition', delta: -2 },
    });
    assert.equal(card?.shaded?.effects, undefined);

    // Terror placement via zoneVar + global counter sync
    const shadedTerror = card?.shaded?.targets?.[0]?.effects?.filter((effect) => 'addVar' in effect);
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

  it('compiles card 75 (Sihanouk) with exact branch structure and staged shaded follow-ups', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-75');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Sihanouk');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'NVA', 'US', 'VC']);

    assert.equal(card?.unshaded?.freeOperationGrants, undefined);
    assert.deepEqual(
      card?.unshaded?.branches?.map((branch) => branch.id),
      ['sihanouk-execute-as-us', 'sihanouk-execute-as-arvn'],
    );

    const usBranch = card?.unshaded?.branches?.[0]?.freeOperationGrants ?? [];
    const arvnBranch = card?.unshaded?.branches?.[1]?.freeOperationGrants ?? [];
    assert.equal(usBranch[0]?.seat, 'us');
    assert.equal(usBranch[0]?.executeAsSeat, 'us');
    assert.equal(usBranch[0]?.allowDuringMonsoon, true);
    assert.equal(usBranch[1]?.operationClass, 'limitedOperation');
    assert.equal(arvnBranch[0]?.seat, 'arvn');
    assert.equal(arvnBranch[0]?.allowDuringMonsoon, true);
    assert.equal(arvnBranch[1]?.operationClass, 'limitedOperation');

    assert.equal(card?.shaded?.effectTiming, 'afterGrants');
    assert.equal(card?.shaded?.freeOperationGrants?.[0]?.seat, 'vc');
    assert.equal(card?.shaded?.freeOperationGrants?.[0]?.actionIds?.[0], 'rally');
    const shadedEffects = card?.shaded?.effects ?? [];
    assert.equal(shadedEffects.length, 3);
    const followUpMarch = (shadedEffects[0] as { grantFreeOperation?: Record<string, unknown> }).grantFreeOperation;
    assert.deepEqual(followUpMarch?.executionContext, { originRestrictionKey: 'sihanouk-rally-spaces' });
    assert.equal(followUpMarch?.allowDuringMonsoon, true);
    const nvaMarch = (shadedEffects[2] as { grantFreeOperation?: Record<string, unknown> }).grantFreeOperation;
    assert.deepEqual(nvaMarch?.executionContext, { originRestrictionKey: 'sihanouk-rally-spaces' });
    assert.equal(nvaMarch?.allowDuringMonsoon, true);
  });

  it('compiles card 51 (301st Supply Bn) with cross-space insurgent removal and shaded rollRandom resource gain', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-51');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, '301st Supply Bn');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'VC', 'US', 'ARVN']);

    const unshadedEffects = card?.unshaded?.effects ?? [];
    const unshadedLet = unshadedEffects.find((effect) => 'let' in effect);
    assert.notEqual(unshadedLet, undefined);
    assert.equal(card?.unshaded?.targets, undefined);

    const shadedTrail = card?.shaded?.effects?.find((effect) => 'addVar' in effect && effect.addVar.var === 'trail');
    assert.deepEqual(shadedTrail, { addVar: { scope: 'global', var: 'trail', delta: 2 } });

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
