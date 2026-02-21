import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL tutorial capability/momentum event-card production spec', () => {
  it('compiles card 101 (Booby Traps) as a dual-use capability marker event', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-101');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Booby Traps');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    const boobyFactionOrder = card?.metadata?.seatOrder;
    assert.equal(Array.isArray(boobyFactionOrder), true);
    assert.equal((boobyFactionOrder as readonly string[]).join(','), 'VC,NVA,US,ARVN');
    assert.equal(card?.tags?.includes('capability'), true);

    assert.deepEqual(card?.unshaded?.effects, [{ setGlobalMarker: { marker: 'cap_boobyTraps', state: 'unshaded' } }]);
    assert.deepEqual(card?.shaded?.effects, [{ setGlobalMarker: { marker: 'cap_boobyTraps', state: 'shaded' } }]);
  });

  it('compiles card 17 (Claymores) as a dual-use momentum with round lasting effect and stay-eligible override', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-17');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Claymores');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    const claymoresFactionOrder = card?.metadata?.seatOrder;
    assert.equal(Array.isArray(claymoresFactionOrder), true);
    assert.equal((claymoresFactionOrder as readonly string[]).join(','), 'US,ARVN,VC,NVA');
    assert.equal(card?.tags?.includes('momentum'), true);

    assert.deepEqual(card?.unshaded?.eligibilityOverrides, [
      { target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' },
    ]);
    assert.deepEqual(card?.unshaded?.lastingEffects, [
      {
        id: 'mom-claymores',
        duration: 'round',
        setupEffects: [{ setVar: { scope: 'global', var: 'mom_claymores', value: true } }],
        teardownEffects: [{ setVar: { scope: 'global', var: 'mom_claymores', value: false } }],
      },
    ]);

    const shadedRemoval = card?.shaded?.effects?.find((effect) => 'removeByPriority' in effect);
    assert.notEqual(shadedRemoval, undefined);
    if (shadedRemoval !== undefined && 'removeByPriority' in shadedRemoval) {
      assert.equal(shadedRemoval.removeByPriority.budget, 2);
      assert.equal(shadedRemoval.removeByPriority.groups.length, 2);
    }
  });
});
