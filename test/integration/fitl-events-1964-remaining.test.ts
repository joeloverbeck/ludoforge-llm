import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-15', order: 15, title: 'Medevac', factionOrder: ['US', 'ARVN', 'NVA', 'VC'] },
  { id: 'card-26', order: 26, title: 'LRRP', factionOrder: ['US', 'VC', 'ARVN', 'NVA'] },
  { id: 'card-29', order: 29, title: 'Tribesmen', factionOrder: ['US', 'VC', 'ARVN', 'NVA'] },
  { id: 'card-31', order: 31, title: 'AAA', factionOrder: ['NVA', 'US', 'ARVN', 'VC'] },
  { id: 'card-48', order: 48, title: 'Nam Dong', factionOrder: ['NVA', 'ARVN', 'VC', 'US'] },
  { id: 'card-50', order: 50, title: 'Uncle Ho', factionOrder: ['NVA', 'ARVN', 'VC', 'US'] },
  { id: 'card-63', order: 63, title: 'Fact Finding', factionOrder: ['ARVN', 'US', 'NVA', 'VC'] },
  { id: 'card-66', order: 66, title: 'Ambassador Taylor', factionOrder: ['ARVN', 'US', 'VC', 'NVA'] },
  { id: 'card-93', order: 93, title: 'Senator Fulbright', factionOrder: ['VC', 'US', 'NVA', 'ARVN'] },
  { id: 'card-110', order: 110, title: 'No Contact', factionOrder: ['VC', 'NVA', 'ARVN', 'US'] },
  { id: 'card-118', order: 118, title: 'Korean War Arms', factionOrder: ['VC', 'ARVN', 'NVA', 'US'] },
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
      assert.deepEqual(card?.metadata?.factionOrder, expected.factionOrder);
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
    assert.deepEqual(card?.unshaded?.effects, [{ setGlobalMarker: { marker: 'cap_aaa', state: 'unshaded' } }]);
    assert.deepEqual(card?.shaded?.effects, [{ setGlobalMarker: { marker: 'cap_aaa', state: 'shaded' } }]);
  });

  it('encodes card 50 (Uncle Ho) free-operation grants as limitedOperation class constraints', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-50');
    assert.notEqual(card, undefined);

    const unshadedGrants = (card?.unshaded?.branches ?? []).flatMap((branch) => branch.freeOperationGrants ?? []);
    const shadedGrants = (card?.shaded?.branches ?? []).flatMap((branch) => branch.freeOperationGrants ?? []);
    assert.equal(unshadedGrants.length > 0, true);
    assert.equal(shadedGrants.length > 0, true);
    assert.equal(unshadedGrants.every((grant) => grant.operationClass === 'limitedOperation'), true);
    assert.equal(shadedGrants.every((grant) => grant.operationClass === 'limitedOperation'), true);
  });
});
