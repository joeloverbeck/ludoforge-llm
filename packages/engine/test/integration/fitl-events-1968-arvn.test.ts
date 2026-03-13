import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-61', order: 61, title: 'Armored Cavalry', sideMode: 'dual', seatOrder: ['ARVN', 'US', 'NVA', 'VC'] },
  { id: 'card-62', order: 62, title: 'Cambodian Civil War', sideMode: 'dual', seatOrder: ['ARVN', 'US', 'NVA', 'VC'] },
  { id: 'card-65', order: 65, title: 'International Forces', sideMode: 'dual', seatOrder: ['ARVN', 'US', 'NVA', 'VC'] },
  { id: 'card-71', order: 71, title: 'An Loc', sideMode: 'dual', seatOrder: ['ARVN', 'NVA', 'US', 'VC'] },
  { id: 'card-74', order: 74, title: 'Lam Son 719', sideMode: 'dual', seatOrder: ['ARVN', 'NVA', 'US', 'VC'] },
  { id: 'card-77', order: 77, title: 'Detente', sideMode: 'dual', seatOrder: ['ARVN', 'NVA', 'VC', 'US'] },
  { id: 'card-80', order: 80, title: 'Light at the End of the Tunnel', sideMode: 'single', seatOrder: ['ARVN', 'NVA', 'VC', 'US'] },
  { id: 'card-84', order: 84, title: 'To Quoc', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'US', 'NVA'] },
  { id: 'card-88', order: 88, title: 'Phan Quang Dan', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'NVA', 'US'] },
] as const;

describe('FITL 1968 ARVN-first event-card production spec', () => {
  it('compiles all 9 ARVN-first 1968 cards with side-mode and metadata invariants', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    for (const expected of expectedCards) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined, `Expected ${expected.id} to exist`);
      assert.equal(card?.title, expected.title);
      assert.equal(card?.order, expected.order);
      assert.equal(card?.sideMode, expected.sideMode);
      assert.equal(card?.metadata?.period, '1968');
      assert.deepEqual(card?.metadata?.seatOrder, expected.seatOrder);
      assert.equal(typeof card?.metadata?.flavorText, 'string', `${expected.id} must include flavorText`);
      assert.equal(typeof card?.unshaded?.text, 'string', `${expected.id} must include unshaded text`);

      if (expected.sideMode === 'dual') {
        assert.equal(typeof card?.shaded?.text, 'string', `${expected.id} must include shaded text`);
      } else {
        assert.equal(card?.shaded, undefined, `${expected.id} single-side payload must not define shaded side`);
      }
    }
  });

  it('encodes card 61 (Armored Cavalry) as ARVN capability marker toggles', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-61');
    assert.notEqual(card, undefined);
    assert.equal(card?.tags?.includes('capability'), true);
    assert.equal(card?.tags?.includes('ARVN'), true);
    assert.equal(card?.unshaded?.text, 'ARVN in 1 Transport destination after Ops may free Assault.');
    assert.equal(card?.shaded?.text, 'Transport Rangers only.');
    assert.deepEqual(card?.unshaded?.effects, [{ setGlobalMarker: { marker: 'cap_armoredCavalry', state: 'unshaded' } }]);
    assert.deepEqual(card?.shaded?.effects, [{ setGlobalMarker: { marker: 'cap_armoredCavalry', state: 'shaded' } }]);
  });

  it('encodes card 77 (Detente) with insurgent-only unshaded losses and the shaded NVA-then-VC branch structure', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-77');
    assert.notEqual(card, undefined);
    assert.equal(
      card?.unshaded?.text,
      'Cut NVA and VC Resources each to half their total (round down). 5 Available NVA Troops out of play.',
    );
    assert.deepEqual(card?.unshaded?.effects, [
      { setVar: { scope: 'global', var: 'nvaResources', value: { op: 'floorDiv', left: { ref: 'gvar', var: 'nvaResources' }, right: 2 } } },
      { setVar: { scope: 'global', var: 'vcResources', value: { op: 'floorDiv', left: { ref: 'gvar', var: 'vcResources' }, right: 2 } } },
      {
        forEach: {
          bind: '$nvaTroopOutOfPlay',
          over: {
            query: 'tokensInZone',
            zone: 'available-NVA:none',
            filter: {
              op: 'and',
              args: [
                { prop: 'faction', op: 'eq', value: 'NVA' },
                { prop: 'type', op: 'eq', value: 'troops' },
              ],
            },
          },
          limit: 5,
          effects: [
            { moveToken: { token: '$nvaTroopOutOfPlay', from: 'available-NVA:none', to: { zoneExpr: 'out-of-play-NVA:none' } } },
          ],
        },
      },
    ]);

    assert.equal(card?.shaded?.text, 'NVA add +9 Resources or free Infiltrate. Then VC free Rally in up to 6 spaces.');
    assert.deepEqual(card?.shaded?.branches?.map((branch) => branch.id), ['detente-nva-add-resources', 'detente-nva-infiltrate']);

    const addResources = card?.shaded?.branches?.find((branch) => branch.id === 'detente-nva-add-resources');
    assert.deepEqual(addResources?.effects, [
      { addVar: { scope: 'global', var: 'nvaResources', delta: 9 } },
      {
        grantFreeOperation: {
          seat: 'vc',
          sequence: { batch: 'detente-vc-rally', step: 0 },
          viabilityPolicy: 'requireUsableAtIssue',
          completionPolicy: 'required',
          outcomePolicy: 'mustChangeGameplayState',
          postResolutionTurnFlow: 'resumeCardFlow',
          operationClass: 'operation',
          actionIds: ['rally'],
          moveZoneBindings: ['$targetSpaces'],
          executionContext: { maxSpaces: 6 },
        },
      },
    ]);

    const infiltrate = card?.shaded?.branches?.find((branch) => branch.id === 'detente-nva-infiltrate');
    assert.equal(infiltrate?.effectTiming, 'afterGrants');
    assert.deepEqual(infiltrate?.freeOperationGrants, [
      {
        seat: 'nva',
        sequence: { batch: 'detente-nva', step: 0 },
        viabilityPolicy: 'requireUsableForEventPlay',
        completionPolicy: 'required',
        outcomePolicy: 'mustChangeGameplayState',
        postResolutionTurnFlow: 'resumeCardFlow',
        operationClass: 'specialActivity',
        actionIds: ['infiltrate'],
      },
    ]);
    assert.deepEqual(infiltrate?.effects, [
      {
        grantFreeOperation: {
          seat: 'vc',
          sequence: { batch: 'detente-vc-rally', step: 0 },
          viabilityPolicy: 'requireUsableAtIssue',
          completionPolicy: 'required',
          outcomePolicy: 'mustChangeGameplayState',
          postResolutionTurnFlow: 'resumeCardFlow',
          operationClass: 'operation',
          actionIds: ['rally'],
          moveZoneBindings: ['$targetSpaces'],
          executionContext: { maxSpaces: 6 },
        },
      },
    ]);
  });
});
