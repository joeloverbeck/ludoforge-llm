import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-95', order: 95, title: 'Westmoreland', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'US', 'NVA', 'ARVN'] },
  { id: 'card-98', order: 98, title: 'Long Tan', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'US', 'ARVN', 'NVA'] },
  { id: 'card-99', order: 99, title: 'Masher/White Wing', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'US', 'ARVN', 'NVA'] },
  { id: 'card-100', order: 100, title: 'Rach Ba Rai', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'US', 'ARVN', 'NVA'] },
  { id: 'card-102', order: 102, title: 'Cu Chi', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'NVA', 'US', 'ARVN'] },
  { id: 'card-104', order: 104, title: 'Main Force Bns', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'NVA', 'US', 'ARVN'] },
  { id: 'card-105', order: 105, title: 'Rural Pressure', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'NVA', 'US', 'ARVN'] },
  { id: 'card-106', order: 106, title: 'Binh Duong', sideMode: 'single', period: '1965', seatOrder: ['VC', 'NVA', 'ARVN', 'US'] },
  { id: 'card-108', order: 108, title: 'Draft Dodgers', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'NVA', 'ARVN', 'US'] },
  { id: 'card-109', order: 109, title: 'Nguyen Huu Tho', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'NVA', 'ARVN', 'US'] },
  { id: 'card-114', order: 114, title: 'Tri Quang', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'ARVN', 'US', 'NVA'] },
  { id: 'card-116', order: 116, title: 'Cadres', sideMode: 'dual', period: '1964', seatOrder: ['VC', 'ARVN', 'NVA', 'US'] },
] as const;

describe('FITL VC-first event-card production spec batch', () => {
  it('compiles all 12 cards with correct metadata and side-shape invariants', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    for (const expected of expectedCards) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined, `Expected ${expected.id} to exist`);
      assert.equal(card?.title, expected.title);
      assert.equal(card?.order, expected.order);
      assert.equal(card?.sideMode, expected.sideMode);
      assert.equal(card?.metadata?.period, expected.period);
      assert.deepEqual(card?.metadata?.seatOrder, expected.seatOrder);
      assert.equal(typeof card?.unshaded?.text, 'string', `${expected.id} must include unshaded text`);

      if (expected.sideMode === 'dual') {
        assert.equal(typeof card?.shaded?.text, 'string', `${expected.id} must include shaded text`);
      } else {
        assert.equal(card?.shaded, undefined, `${expected.id} single-side payload must not define shaded side`);
      }
    }
  });

  it('encodes cards 104/116 as VC capability marker toggles', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const expectedCapabilities = [
      { id: 'card-104', marker: 'cap_mainForceBns' },
      { id: 'card-116', marker: 'cap_cadres' },
    ] as const;

    for (const expected of expectedCapabilities) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined);
      assert.equal(card?.tags?.includes('capability'), true, `${expected.id} must include capability tag`);
      assert.equal(card?.tags?.includes('VC'), true, `${expected.id} must include VC tag`);
      assert.deepEqual(card?.unshaded?.effects, [{ setGlobalMarker: { marker: expected.marker, state: 'unshaded' } }]);
      assert.deepEqual(card?.shaded?.effects, [{ setGlobalMarker: { marker: expected.marker, state: 'shaded' } }]);
    }
  });

  it('encodes free-operation sequencing for cards 95 and 99 without kernel-specific handlers', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const westmoreland = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-95');
    assert.notEqual(westmoreland, undefined);
    assert.deepEqual(westmoreland?.unshaded?.freeOperationGrants, [
      {
        seat: 'US',
        sequence: { chain: 'westmoreland-us', step: 0 },
        operationClass: 'operation',
        actionIds: ['airLift'],
      },
      {
        seat: 'US',
        sequence: { chain: 'westmoreland-us', step: 1 },
        operationClass: 'operation',
        actionIds: ['sweep', 'assault'],
      },
      {
        seat: 'US',
        sequence: { chain: 'westmoreland-us', step: 2 },
        operationClass: 'operation',
        actionIds: ['airStrike'],
      },
    ]);

    const masher = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-99');
    assert.notEqual(masher, undefined);
    assert.deepEqual(masher?.unshaded?.freeOperationGrants, [
      {
        seat: 'US',
        sequence: { chain: 'masher-white-wing-us', step: 0 },
        operationClass: 'operation',
        actionIds: ['sweep'],
      },
      {
        seat: 'US',
        sequence: { chain: 'masher-white-wing-us', step: 1 },
        operationClass: 'operation',
        actionIds: ['assault'],
      },
      {
        seat: 'ARVN',
        executeAsSeat: 'US',
        sequence: { chain: 'masher-white-wing-arvn-as-us', step: 0 },
        operationClass: 'operation',
        actionIds: ['sweep'],
      },
      {
        seat: 'ARVN',
        executeAsSeat: 'US',
        sequence: { chain: 'masher-white-wing-arvn-as-us', step: 1 },
        operationClass: 'operation',
        actionIds: ['assault'],
      },
    ]);
  });
});
