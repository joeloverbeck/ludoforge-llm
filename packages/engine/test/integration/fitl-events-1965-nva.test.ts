import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-34', order: 34, title: 'SA-2s', sideMode: 'dual', seatOrder: ['NVA', 'US', 'ARVN', 'VC'] },
  { id: 'card-38', order: 38, title: 'McNamara Line', sideMode: 'single', seatOrder: ['NVA', 'US', 'VC', 'ARVN'] },
  { id: 'card-39', order: 39, title: 'Oriskany', sideMode: 'dual', seatOrder: ['NVA', 'US', 'VC', 'ARVN'] },
  { id: 'card-44', order: 44, title: 'Ia Drang', sideMode: 'dual', seatOrder: ['NVA', 'ARVN', 'US', 'VC'] },
  { id: 'card-46', order: 46, title: '559th Transport Grp', sideMode: 'dual', seatOrder: ['NVA', 'ARVN', 'VC', 'US'] },
  { id: 'card-47', order: 47, title: 'Chu Luc', sideMode: 'dual', seatOrder: ['NVA', 'ARVN', 'VC', 'US'] },
  { id: 'card-53', order: 53, title: 'Sappers', sideMode: 'dual', seatOrder: ['NVA', 'VC', 'US', 'ARVN'] },
  { id: 'card-56', order: 56, title: 'Vo Nguyen Giap', sideMode: 'dual', seatOrder: ['NVA', 'VC', 'ARVN', 'US'] },
  { id: 'card-59', order: 59, title: 'Plei Mei', sideMode: 'dual', seatOrder: ['NVA', 'VC', 'ARVN', 'US'] },
] as const;

describe('FITL 1965 NVA-first event-card production spec', () => {
  it('compiles all 9 NVA-first 1965 cards with side-mode and metadata invariants', () => {
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

  it('encodes card 34 (SA-2s) as capability marker toggles for cap_sa2s', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-34');
    assert.notEqual(card, undefined);
    assert.equal(card?.tags?.includes('capability'), true);
    assert.equal(card?.tags?.includes('NVA'), true);
    assert.deepEqual(card?.unshaded?.effects, [{ setGlobalMarker: { marker: 'cap_sa2s', state: 'unshaded' } }]);
    assert.deepEqual(card?.shaded?.effects, [{ setGlobalMarker: { marker: 'cap_sa2s', state: 'shaded' } }]);
  });

  it('encodes momentum cards 38/39/46 as canonical round-lasting toggles', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const expectedMomentum = [
      { id: 'card-38', side: 'unshaded', effectId: 'mom-mcnamara-line', varName: 'mom_mcnamaraLine' },
      { id: 'card-39', side: 'shaded', effectId: 'mom-oriskany', varName: 'mom_oriskany' },
      { id: 'card-46', side: 'unshaded', effectId: 'mom-559th-transport-grp', varName: 'mom_559thTransportGrp' },
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

  it('encodes card 44 (Ia Drang) as chained US operation grants plus shaded die-roll troop losses', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-44');
    assert.notEqual(card, undefined);

    assert.deepEqual(card?.unshaded?.freeOperationGrants, [
      {
        seat: 'US',
        sequence: { chain: 'ia-drang-us', step: 0 },
        operationClass: 'operation',
        actionIds: ['airLift'],
        zoneFilter: {
          op: '>',
          left: {
            aggregate: {
              op: 'count',
                      query: { query: 'tokensInZone', zone: '$zone', filter: [{ prop: 'faction', op: 'eq', value: 'NVA' }] },
            },
          },
          right: 0,
        },
      },
      {
        seat: 'US',
        sequence: { chain: 'ia-drang-us', step: 1 },
        operationClass: 'operation',
        actionIds: ['sweep'],
        zoneFilter: {
          op: '>',
          left: {
            aggregate: {
              op: 'count',
                      query: { query: 'tokensInZone', zone: '$zone', filter: [{ prop: 'faction', op: 'eq', value: 'NVA' }] },
            },
          },
          right: 0,
        },
      },
      {
        seat: 'US',
        sequence: { chain: 'ia-drang-us', step: 2 },
        operationClass: 'operation',
        actionIds: ['assault'],
        zoneFilter: {
          op: '>',
          left: {
            aggregate: {
              op: 'count',
                      query: { query: 'tokensInZone', zone: '$zone', filter: [{ prop: 'faction', op: 'eq', value: 'NVA' }] },
            },
          },
          right: 0,
        },
      },
    ]);

    assert.equal((card?.shaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 1);
    assert.equal(typeof (card?.shaded?.effects?.[0] as { rollRandom?: unknown })?.rollRandom, 'object');
  });
});
