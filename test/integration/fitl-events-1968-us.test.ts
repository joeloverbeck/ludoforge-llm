import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-2', order: 2, title: 'Kissinger', factionOrder: ['US', 'NVA', 'ARVN', 'VC'] },
  { id: 'card-3', order: 3, title: 'Peace Talks', factionOrder: ['US', 'NVA', 'ARVN', 'VC'] },
  { id: 'card-4', order: 4, title: 'Top Gun', factionOrder: ['US', 'NVA', 'ARVN', 'VC'] },
  { id: 'card-9', order: 9, title: 'Psychedelic Cookie', factionOrder: ['US', 'NVA', 'VC', 'ARVN'] },
  { id: 'card-11', order: 11, title: 'Abrams', factionOrder: ['US', 'ARVN', 'NVA', 'VC'] },
  { id: 'card-12', order: 12, title: 'Capt Buck Adams', factionOrder: ['US', 'ARVN', 'NVA', 'VC'] },
  { id: 'card-13', order: 13, title: 'Cobras', factionOrder: ['US', 'ARVN', 'NVA', 'VC'] },
  { id: 'card-16', order: 16, title: 'Blowtorch Komer', factionOrder: ['US', 'ARVN', 'VC', 'NVA'] },
  { id: 'card-19', order: 19, title: 'CORDS', factionOrder: ['US', 'ARVN', 'VC', 'NVA'] },
  { id: 'card-20', order: 20, title: 'Laser Guided Bombs', factionOrder: ['US', 'ARVN', 'VC', 'NVA'] },
  { id: 'card-21', order: 21, title: 'Americal', factionOrder: ['US', 'VC', 'NVA', 'ARVN'] },
  { id: 'card-30', order: 30, title: 'USS New Jersey', factionOrder: ['US', 'VC', 'ARVN', 'NVA'] },
] as const;

describe('FITL 1968 US-first event-card production spec', () => {
  it('compiles all 12 US-first 1968 cards with dual side metadata invariants', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    for (const expected of expectedCards) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined, `Expected ${expected.id} to exist`);
      assert.equal(card?.title, expected.title);
      assert.equal(card?.order, expected.order);
      assert.equal(card?.sideMode, 'dual');
      assert.equal(card?.metadata?.period, '1968');
      assert.deepEqual(card?.metadata?.factionOrder, expected.factionOrder);
      assert.equal(typeof card?.metadata?.flavorText, 'string', `${expected.id} must include flavorText`);
      assert.equal(typeof card?.unshaded?.text, 'string', `${expected.id} must include unshaded text`);
      assert.equal(typeof card?.shaded?.text, 'string', `${expected.id} must include shaded text`);
    }
  });

  it('encodes 1968 US capability cards as capability marker toggles for both sides', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const expectedCapabilities = [
      { id: 'card-4', marker: 'cap_topGun' },
      { id: 'card-11', marker: 'cap_abrams' },
      { id: 'card-13', marker: 'cap_cobras' },
      { id: 'card-19', marker: 'cap_cords' },
      { id: 'card-20', marker: 'cap_lgbs' },
    ] as const;

    for (const expected of expectedCapabilities) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined);
      assert.equal(card?.tags?.includes('capability'), true, `${expected.id} must include capability tag`);
      assert.equal(card?.tags?.includes('US'), true, `${expected.id} must include US tag`);
      assert.deepEqual(card?.unshaded?.effects, [{ setGlobalMarker: { marker: expected.marker, state: 'unshaded' } }]);
      assert.deepEqual(card?.shaded?.effects, [{ setGlobalMarker: { marker: expected.marker, state: 'shaded' } }]);
    }
  });

  it('encodes card 16 (Blowtorch Komer) as unshaded round momentum toggle', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-16');
    assert.notEqual(card, undefined);
    assert.equal(card?.tags?.includes('momentum'), true);

    const momentum = card?.unshaded?.lastingEffects?.find((effect) => effect.id === 'mom-blowtorch-komer');
    assert.notEqual(momentum, undefined);
    assert.equal(momentum?.duration, 'round');
    assert.deepEqual(momentum?.setupEffects, [{ setVar: { scope: 'global', var: 'mom_blowtorchKomer', value: true } }]);
    assert.deepEqual(momentum?.teardownEffects, [{ setVar: { scope: 'global', var: 'mom_blowtorchKomer', value: false } }]);
  });

  it('keeps card 27 (Phoenix Program) unchanged as a non-regression anchor', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-27');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Phoenix Program');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.factionOrder, ['US', 'VC', 'ARVN', 'NVA']);
    assert.deepEqual(card?.unshaded?.effects, [{ addVar: { scope: 'global', var: 'aid', delta: -1 } }]);
    assert.deepEqual(card?.shaded?.effects, [
      { addVar: { scope: 'global', var: 'aid', delta: -2 } },
      { addVar: { scope: 'global', var: 'arvnResources', delta: -1 } },
    ]);
  });
});
