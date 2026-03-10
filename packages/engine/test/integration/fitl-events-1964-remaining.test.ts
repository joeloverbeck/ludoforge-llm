import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-15', order: 15, title: 'Medevac', seatOrder: ['US', 'ARVN', 'NVA', 'VC'] },
  { id: 'card-26', order: 26, title: 'LRRP', seatOrder: ['US', 'VC', 'ARVN', 'NVA'] },
  { id: 'card-29', order: 29, title: 'Tribesmen', seatOrder: ['US', 'VC', 'ARVN', 'NVA'] },
  { id: 'card-31', order: 31, title: 'AAA', seatOrder: ['NVA', 'US', 'ARVN', 'VC'] },
  { id: 'card-48', order: 48, title: 'Nam Dong', seatOrder: ['NVA', 'ARVN', 'VC', 'US'] },
  { id: 'card-50', order: 50, title: 'Uncle Ho', seatOrder: ['NVA', 'ARVN', 'VC', 'US'] },
  { id: 'card-63', order: 63, title: 'Fact Finding', seatOrder: ['ARVN', 'US', 'NVA', 'VC'] },
  { id: 'card-66', order: 66, title: 'Ambassador Taylor', seatOrder: ['ARVN', 'US', 'VC', 'NVA'] },
  { id: 'card-93', order: 93, title: 'Senator Fulbright', seatOrder: ['VC', 'US', 'NVA', 'ARVN'] },
  { id: 'card-110', order: 110, title: 'No Contact', seatOrder: ['VC', 'NVA', 'ARVN', 'US'] },
  { id: 'card-118', order: 118, title: 'Korean War Arms', seatOrder: ['VC', 'ARVN', 'NVA', 'US'] },
] as const;

describe('FITL 1964 remaining event-card production spec', () => {
  it('compiles all 11 non-tutorial 1964 cards with dual side metadata invariants', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    for (const expected of expectedCards) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined, `Expected ${expected.id} to exist`);
      assert.equal(card?.title, expected.title);
      assert.equal(card?.order, expected.order);
      assert.equal(card?.sideMode, 'dual');
      assert.equal(card?.metadata?.period, '1964');
      assert.deepEqual(card?.metadata?.seatOrder, expected.seatOrder);
      assert.equal(typeof card?.unshaded?.text, 'string', `${expected.id} must include unshaded text`);
      assert.equal(typeof card?.shaded?.text, 'string', `${expected.id} must include shaded text`);
    }
  });

  it('encodes card 15 (Medevac) as canonical momentum lasting effects on both sides', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-15');
    assert.notEqual(card, undefined);
    assert.equal(card?.tags?.includes('momentum'), true);
    assert.equal(card?.unshaded?.text, 'This Commitment, all Troop Casualties Available. MOMENTUM');
    assert.equal(card?.shaded?.text, 'Executing Faction remains Eligible. Until Coup, no Air Lift. MOMENTUM');
    assert.deepEqual(card?.shaded?.eligibilityOverrides, [
      { target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' },
    ]);

    const unshadedMomentum = card?.unshaded?.lastingEffects?.find((effect) => effect.id === 'mom-medevac-unshaded');
    assert.notEqual(unshadedMomentum, undefined);
    assert.equal(unshadedMomentum?.duration, 'round');
    assert.deepEqual(unshadedMomentum?.setupEffects, [{ setVar: { scope: 'global', var: 'mom_medevacUnshaded', value: true } }]);
    assert.deepEqual(unshadedMomentum?.teardownEffects, [{ setVar: { scope: 'global', var: 'mom_medevacUnshaded', value: false } }]);

    const shadedMomentum = card?.shaded?.lastingEffects?.find((effect) => effect.id === 'mom-medevac-shaded');
    assert.notEqual(shadedMomentum, undefined);
    assert.equal(shadedMomentum?.duration, 'round');
    assert.deepEqual(shadedMomentum?.setupEffects, [{ setVar: { scope: 'global', var: 'mom_medevacShaded', value: true } }]);
    assert.deepEqual(shadedMomentum?.teardownEffects, [{ setVar: { scope: 'global', var: 'mom_medevacShaded', value: false } }]);
  });

  it('encodes card 31 (AAA) as capability marker toggles for cap_aaa', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-31');
    assert.notEqual(card, undefined);

    assert.equal(card?.tags?.includes('capability'), true);
    assert.equal(card?.tags?.includes('NVA'), true);
    assert.equal(card?.unshaded?.text, 'Rally that Improves Trail may select 1 space only. NVA CAPABILITY.');
    assert.equal(card?.shaded?.text, 'Air Strike does not Degrade Trail below 2.');
    assert.deepEqual(card?.unshaded?.effects, [{ setGlobalMarker: { marker: 'cap_aaa', state: 'unshaded' } }]);
    assert.deepEqual(card?.shaded?.effects, [{ setGlobalMarker: { marker: 'cap_aaa', state: 'shaded' } }]);
  });

  it('encodes card 50 (Uncle Ho) exact text, corrected branches, and limited-operation sequencing', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-50');
    assert.notEqual(card, undefined);
    assert.equal(
      card?.unshaded?.text,
      '4 out-of-play US Troops to South Vietnam, or ARVN Resources +9. ARVN executes any 2 free Limited Operations.',
    );
    assert.equal(
      card?.shaded?.text,
      'Revolutionary unifier: VC then NVA each execute 3 free Limited Operations.',
    );

    const unshadedBranches = card?.unshaded?.branches ?? [];
    assert.deepEqual(
      unshadedBranches.map((branch) => branch.id),
      ['place-us-troops-and-arvn-two-free-limited-ops', 'add-arvn-resources-and-arvn-two-free-limited-ops'],
    );
    assert.deepEqual(
      unshadedBranches.map((branch) => branch.freeOperationGrants?.map((grant) => grant.seat)),
      [['arvn', 'arvn'], ['arvn', 'arvn']],
    );
    assert.equal(
      unshadedBranches.flatMap((branch) => branch.freeOperationGrants ?? []).every((grant) => grant.operationClass === 'limitedOperation'),
      true,
    );

    const shadedBranches = card?.shaded?.branches ?? [];
    assert.deepEqual(shadedBranches.map((branch) => branch.id), ['vc-then-nva-six-free-limited-ops']);
    const shadedGrants = shadedBranches[0]?.freeOperationGrants ?? [];
    assert.deepEqual(
      shadedGrants.map((grant) => grant.seat),
      ['vc', 'vc', 'vc', 'nva', 'nva', 'nva'],
    );
    assert.deepEqual(
      shadedGrants.map((grant) => grant.sequence),
      [
        { batch: 'uncle-ho-shaded-vc-nva-six', step: 0 },
        { batch: 'uncle-ho-shaded-vc-nva-six', step: 1 },
        { batch: 'uncle-ho-shaded-vc-nva-six', step: 2 },
        { batch: 'uncle-ho-shaded-vc-nva-six', step: 3 },
        { batch: 'uncle-ho-shaded-vc-nva-six', step: 4 },
        { batch: 'uncle-ho-shaded-vc-nva-six', step: 5 },
      ],
    );
    assert.equal(shadedGrants.every((grant) => grant.operationClass === 'limitedOperation'), true);
  });
});
