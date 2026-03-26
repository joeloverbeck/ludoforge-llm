import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { tagEffectAsts } from '../../src/kernel/tag-effect-asts.js';
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

    assert.deepEqual(card?.unshaded?.effects, tagEffectAsts([{ setGlobalMarker: { marker: 'cap_boobyTraps', state: 'unshaded' } }]));
    assert.deepEqual(card?.shaded?.effects, tagEffectAsts([{ setGlobalMarker: { marker: 'cap_boobyTraps', state: 'shaded' } }]));
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
    assert.equal(
      card?.unshaded?.text,
      'Stay Eligible. Until Coup, no Ambush; remove 1 Guerrilla from each Marching group that Activates. MOMENTUM',
    );
    assert.equal(
      card?.shaded?.text,
      'Infiltrators turn mines around: remove 1 COIN Base and 1 Underground Insurgent from a space with both (US to Casualties).',
    );
    assert.equal(card?.shaded?.effects, undefined);

    assert.deepEqual(card?.unshaded?.eligibilityOverrides, [
      { target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' },
    ]);
    assert.deepEqual(card?.unshaded?.lastingEffects, tagEffectAsts([
      {
        id: 'mom-claymores',
        duration: 'round',
        setupEffects: [{ setVar: { scope: 'global', var: 'mom_claymores', value: true } }],
        teardownEffects: [{ setVar: { scope: 'global', var: 'mom_claymores', value: false } }],
      },
    ]));

    const shadedRemovals = (card?.shaded?.targets?.[0]?.effects ?? []).filter((effect) => 'removeByPriority' in effect);
    assert.equal(shadedRemovals.length, 2);
    const first = shadedRemovals[0];
    const second = shadedRemovals[1];
    if (first !== undefined && 'removeByPriority' in first) {
      assert.equal(first.removeByPriority.budget, 1);
      assert.equal(first.removeByPriority.groups.length, 1);
    }
    if (second !== undefined && 'removeByPriority' in second) {
      assert.equal(second.removeByPriority.budget, 1);
      assert.equal(second.removeByPriority.groups.length, 1);
    }
  });
});
