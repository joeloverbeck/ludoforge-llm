import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-5', order: 5, title: 'Wild Weasels', seatOrder: ['US', 'NVA', 'ARVN', 'VC'] },
  { id: 'card-6', order: 6, title: 'Aces', seatOrder: ['US', 'NVA', 'VC', 'ARVN'] },
  { id: 'card-7', order: 7, title: 'ADSID', seatOrder: ['US', 'NVA', 'VC', 'ARVN'] },
  { id: 'card-8', order: 8, title: 'Arc Light', seatOrder: ['US', 'NVA', 'VC', 'ARVN'] },
  { id: 'card-10', order: 10, title: 'Rolling Thunder', seatOrder: ['US', 'NVA', 'VC', 'ARVN'] },
  { id: 'card-14', order: 14, title: 'M-48 Patton', seatOrder: ['US', 'ARVN', 'NVA', 'VC'] },
  { id: 'card-18', order: 18, title: 'Combined Action Platoons', seatOrder: ['US', 'ARVN', 'VC', 'NVA'] },
  { id: 'card-22', order: 22, title: 'Da Nang', seatOrder: ['US', 'VC', 'NVA', 'ARVN'] },
  { id: 'card-23', order: 23, title: 'Operation Attleboro', seatOrder: ['US', 'VC', 'NVA', 'ARVN'] },
  { id: 'card-24', order: 24, title: 'Operation Starlite', seatOrder: ['US', 'VC', 'NVA', 'ARVN'] },
  { id: 'card-25', order: 25, title: 'TF-116 Riverines', seatOrder: ['US', 'VC', 'NVA', 'ARVN'] },
  { id: 'card-28', order: 28, title: 'Search and Destroy', seatOrder: ['US', 'VC', 'ARVN', 'NVA'] },
] as const;

describe('FITL 1965 US-first event-card production spec', () => {
  it('compiles all 12 US-first 1965 cards with dual side metadata invariants', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    for (const expected of expectedCards) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined, `Expected ${expected.id} to exist`);
      assert.equal(card?.title, expected.title);
      assert.equal(card?.order, expected.order);
      assert.equal(card?.sideMode, 'dual');
      assert.equal(card?.metadata?.period, '1965');
      assert.deepEqual(card?.metadata?.seatOrder, expected.seatOrder);
      assert.equal(typeof card?.unshaded?.text, 'string', `${expected.id} must include unshaded text`);
      assert.equal(typeof card?.shaded?.text, 'string', `${expected.id} must include shaded text`);
      if (expected.id === 'card-6') {
        assert.equal(card?.unshaded?.effectTiming, 'afterGrants', 'card-6 unshaded must resolve effects after free grants');
      }
    }
  });

  it('encodes 1965 US capability cards as capability marker toggles', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const expectedCapabilities = [
      { id: 'card-8', marker: 'cap_arcLight' },
      { id: 'card-14', marker: 'cap_m48Patton' },
      { id: 'card-18', marker: 'cap_caps' },
      { id: 'card-28', marker: 'cap_searchAndDestroy' },
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

  it('encodes 1965 US momentum cards using round-lasting setup/teardown toggles', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const expectedMomentum = [
      { id: 'card-5', side: 'shaded', effectId: 'mom-wild-weasels', varName: 'mom_wildWeasels' },
      { id: 'card-7', side: 'unshaded', effectId: 'mom-adsid', varName: 'mom_adsid' },
      { id: 'card-10', side: 'shaded', effectId: 'mom-rolling-thunder', varName: 'mom_rollingThunder' },
      { id: 'card-22', side: 'shaded', effectId: 'mom-da-nang', varName: 'mom_daNang' },
    ] as const;

    for (const expected of expectedMomentum) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined);
      assert.equal(card?.tags?.includes('momentum'), true, `${expected.id} must include momentum tag`);
      const side = expected.side === 'unshaded' ? card?.unshaded : card?.shaded;
      const effect = side?.lastingEffects?.find((entry) => entry.id === expected.effectId);
      assert.notEqual(effect, undefined, `${expected.id} ${expected.side} must include ${expected.effectId}`);
      assert.equal(effect?.duration, 'round');
      assert.deepEqual(effect?.setupEffects, [{ setVar: { scope: 'global', var: expected.varName, value: true } }]);
      assert.deepEqual(effect?.teardownEffects, [{ setVar: { scope: 'global', var: expected.varName, value: false } }]);
    }
  });
});
