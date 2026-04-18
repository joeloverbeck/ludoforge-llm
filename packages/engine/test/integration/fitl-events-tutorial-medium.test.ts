// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { tagEffectAsts } from '../../src/kernel/tag-effect-asts.js';

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
    assert.deepEqual(unshadedTrail, tagEffectAsts({ addVar: { scope: 'global', var: 'trail', delta: -2 } }));
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
    assert.deepEqual(shadedShift, tagEffectAsts({
      shiftMarker: { space: '$targetCity', marker: 'supportOpposition', delta: -2 },
    }));
    assert.equal(card?.shaded?.effects, undefined);

    // Terror placement via zoneVar + global counter sync
    const terrorGuard = card?.shaded?.targets?.[0]?.effects?.find((effect) => 'if' in effect && effect.if.then.some((nested) => 'addVar' in nested));
    assert.notEqual(terrorGuard, undefined, 'Expected shaded Brinks Hotel to guard terror placement behind a conditional effect');
    const shadedTerror = 'if' in terrorGuard!
      ? terrorGuard.if.then.filter((effect) => 'addVar' in effect)
      : [];
    assert.equal(shadedTerror.length, 2, 'Expected 2 guarded addVar effects (zoneVar terrorCount + global counter)');
    const zoneVarTerror = shadedTerror.find(
      (effect) => effect.addVar.scope === 'zoneVar' && effect.addVar.var === 'terrorCount',
    );
    assert.notEqual(zoneVarTerror, undefined, 'Expected addVar zoneVar terrorCount effect');
    const globalCounter = shadedTerror.find(
      (effect) => effect.addVar.scope === 'global' && effect.addVar.var === 'terrorSabotageMarkersPlaced',
    );
    assert.notEqual(globalCounter, undefined, 'Expected addVar global terrorSabotageMarkersPlaced effect');
  });

  it('compiles card 75 (Sihanouk) with exact branch structure and staged shaded faction batches', () => {
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
    const shadedGrants = card?.shaded?.freeOperationGrants ?? [];
    assert.equal(shadedGrants.length, 2);
    assert.deepEqual(
      shadedGrants.map((grant) => ({
        seat: grant.seat,
        actionId: grant.actionIds?.[0],
        batch: grant.sequence?.batch,
        step: grant.sequence?.step,
      })),
      [
        { seat: 'vc', actionId: 'rally', batch: 'sihanouk-shaded-vc', step: 0 },
        { seat: 'vc', actionId: 'march', batch: 'sihanouk-shaded-vc', step: 1 },
      ],
    );
    assert.equal(shadedGrants[0]?.viabilityPolicy, 'requireUsableAtIssue');
    assert.equal(shadedGrants[0]?.outcomePolicy, 'mustChangeGameplayState');
    assert.deepEqual(shadedGrants[0]?.moveZoneBindings, ['$targetSpaces']);
    assert.equal(shadedGrants[0]?.sequenceContext?.captureMoveZoneCandidatesAs, 'sihanouk-rally-spaces');
    assert.deepEqual(shadedGrants[1]?.moveZoneBindings, ['$targetSpaces']);
    assert.deepEqual(shadedGrants[1]?.moveZoneProbeBindings, ['$targetSpaces']);
    assert.deepEqual(shadedGrants[1]?.executionContext, { originRestrictionKey: 'sihanouk-rally-spaces' });
    assert.equal(shadedGrants[1]?.allowDuringMonsoon, true);

    const shadedEffects = card?.shaded?.effects ?? [];
    assert.equal(shadedEffects.length, 2);
    const nvaRally = (shadedEffects[0] as { grantFreeOperation?: Record<string, unknown> }).grantFreeOperation;
    assert.equal(nvaRally?.seat, 'nva');
    assert.equal(nvaRally?.viabilityPolicy, 'requireUsableAtIssue');
    assert.equal(nvaRally?.outcomePolicy, 'mustChangeGameplayState');
    assert.deepEqual((nvaRally as { sequence?: Record<string, unknown> } | undefined)?.sequence, {
      batch: 'sihanouk-shaded-nva',
      step: 0,
    });
    const nvaMarch = (shadedEffects[1] as { grantFreeOperation?: Record<string, unknown> }).grantFreeOperation;
    assert.equal(nvaMarch?.seat, 'nva');
    assert.equal(nvaMarch?.outcomePolicy, 'mustChangeGameplayState');
    assert.deepEqual((nvaMarch as { sequence?: Record<string, unknown> } | undefined)?.sequence, {
      batch: 'sihanouk-shaded-nva',
      step: 1,
    });
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
    assert.deepEqual(shadedTrail, tagEffectAsts({ addVar: { scope: 'global', var: 'trail', delta: 2 } }));

    const shadedRoll = card?.shaded?.effects?.find((effect) => 'rollRandom' in effect);
    assert.notEqual(shadedRoll, undefined);
    if (shadedRoll !== undefined && 'rollRandom' in shadedRoll) {
      assert.equal(shadedRoll.rollRandom.bind, '$dieRoll');
      assert.equal(shadedRoll.rollRandom.min, 1);
      assert.equal(shadedRoll.rollRandom.max, 6);
      assert.deepEqual(shadedRoll.rollRandom.in, tagEffectAsts([
        {
          addVar: {
            scope: 'global',
            var: 'nvaResources',
            delta: { _t: 2, ref: 'binding', name: '$dieRoll' },
          },
        },
      ]));
    }
  });
});
