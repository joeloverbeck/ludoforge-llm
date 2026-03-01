import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-64', order: 64, title: 'Honolulu Conference', sideMode: 'single', seatOrder: ['ARVN', 'US', 'NVA', 'VC'] },
  { id: 'card-67', order: 67, title: 'Amphib Landing', sideMode: 'dual', seatOrder: ['ARVN', 'US', 'VC', 'NVA'] },
  { id: 'card-69', order: 69, title: 'MACV', sideMode: 'single', seatOrder: ['ARVN', 'US', 'VC', 'NVA'] },
  { id: 'card-70', order: 70, title: 'ROKs', sideMode: 'dual', seatOrder: ['ARVN', 'US', 'VC', 'NVA'] },
  { id: 'card-72', order: 72, title: 'Body Count', sideMode: 'dual', seatOrder: ['ARVN', 'NVA', 'US', 'VC'] },
  { id: 'card-73', order: 73, title: 'Great Society', sideMode: 'dual', seatOrder: ['ARVN', 'NVA', 'US', 'VC'] },
  { id: 'card-76', order: 76, title: 'Annam', sideMode: 'dual', seatOrder: ['ARVN', 'NVA', 'VC', 'US'] },
  { id: 'card-78', order: 78, title: 'General Landsdale', sideMode: 'dual', seatOrder: ['ARVN', 'NVA', 'VC', 'US'] },
  { id: 'card-81', order: 81, title: 'CIDG', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'US', 'NVA'] },
  { id: 'card-83', order: 83, title: 'Election', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'US', 'NVA'] },
  { id: 'card-85', order: 85, title: 'USAID', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'US', 'NVA'] },
  { id: 'card-86', order: 86, title: 'Mandate of Heaven', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'NVA', 'US'] },
  { id: 'card-87', order: 87, title: 'Nguyen Chanh Thi', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'NVA', 'US'] },
  { id: 'card-89', order: 89, title: 'Tam Chau', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'NVA', 'US'] },
  { id: 'card-90', order: 90, title: 'Walt Rostow', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'NVA', 'US'] },
] as const;

describe('FITL 1965 ARVN-first event-card production spec', () => {
  it('compiles all 15 ARVN-first 1965 cards with side-mode and metadata invariants', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    for (const expected of expectedCards) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined, `Expected ${expected.id} to exist`);
      assert.equal(card?.title, expected.title);
      assert.equal(card?.order, expected.order);
      assert.equal(card?.sideMode, expected.sideMode);
      assert.equal(card?.metadata?.period, '1965');
      assert.deepEqual(card?.metadata?.seatOrder, expected.seatOrder);
      assert.equal(typeof card?.unshaded?.text, 'string', `${expected.id} must include unshaded text`);

      if (expected.sideMode === 'dual') {
        assert.equal(typeof card?.shaded?.text, 'string', `${expected.id} must include shaded text`);
      } else {
        assert.equal(card?.shaded, undefined, `${expected.id} single-side payload must not define shaded side`);
      }
    }
  });

  it('encodes card 86 (Mandate of Heaven) as ARVN capability marker toggles', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-86');
    assert.notEqual(card, undefined);
    assert.equal(card?.tags?.includes('capability'), true);
    assert.equal(card?.tags?.includes('ARVN'), true);
    assert.deepEqual(card?.unshaded?.effects, [{ setGlobalMarker: { marker: 'cap_mandateOfHeaven', state: 'unshaded' } }]);
    assert.deepEqual(card?.shaded?.effects, [{ setGlobalMarker: { marker: 'cap_mandateOfHeaven', state: 'shaded' } }]);
  });

  it('encodes card 70 (ROKs) free grants with executeAsSeat override for as-if-US operations', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-70');
    assert.notEqual(card, undefined);

    assert.deepEqual(card?.unshaded?.freeOperationGrants, [
      {
        seat: 'arvn',
        executeAsSeat: 'us',
        sequence: { chain: 'roks-arvn-as-us', step: 0 },
        operationClass: 'operation',
        actionIds: ['sweep'],
      },
      {
        seat: 'arvn',
        executeAsSeat: 'us',
        sequence: { chain: 'roks-arvn-as-us', step: 1 },
        operationClass: 'operation',
        actionIds: ['assault'],
      },
    ]);
  });

  it('encodes cards 72/78 as canonical momentum round-lasting toggles', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const expectedMomentum = [
      { id: 'card-72', side: 'unshaded', effectId: 'mom-body-count', varName: 'mom_bodyCount' },
      { id: 'card-78', side: 'shaded', effectId: 'mom-general-landsdale', varName: 'mom_generalLansdale' },
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

  it('encodes card 73 (Great Society) shaded side as US available-to-out-of-play removal', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-73');
    assert.notEqual(card, undefined);
    assert.equal(card?.unshaded?.text, 'Conduct a Commitment Phase.');
    assert.deepEqual(card?.unshaded?.effects, [
      { pushInterruptPhase: { phase: 'commitment', resumePhase: 'main' } },
    ]);
    assert.deepEqual(card?.shaded?.effects, [
      {
        removeByPriority: {
          budget: 3,
          groups: [
            {
              bind: 'usAvailablePiece',
              over: {
                  query: 'tokensInZone',
                  zone: 'available-US:none',
                  filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
                },
              to: { zoneExpr: 'out-of-play-US:none' },
            },
          ],
        },
      },
    ]);
  });
});
