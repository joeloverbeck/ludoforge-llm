import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-32', order: 32, title: 'Long Range Guns', factionOrder: ['NVA', 'US', 'ARVN', 'VC'] },
  { id: 'card-33', order: 33, title: 'MiGs', factionOrder: ['NVA', 'US', 'ARVN', 'VC'] },
  { id: 'card-35', order: 35, title: 'Thanh Hoa', factionOrder: ['NVA', 'US', 'ARVN', 'VC'] },
  { id: 'card-36', order: 36, title: 'Hamburger Hill', factionOrder: ['NVA', 'US', 'VC', 'ARVN'] },
  { id: 'card-37', order: 37, title: 'Khe Sanh', factionOrder: ['NVA', 'US', 'VC', 'ARVN'] },
  { id: 'card-40', order: 40, title: 'PoWs', factionOrder: ['NVA', 'US', 'VC', 'ARVN'] },
  { id: 'card-41', order: 41, title: 'Bombing Pause', factionOrder: ['NVA', 'ARVN', 'US', 'VC'] },
  { id: 'card-42', order: 42, title: 'Chou En Lai', factionOrder: ['NVA', 'ARVN', 'US', 'VC'] },
  { id: 'card-45', order: 45, title: 'PT-76', factionOrder: ['NVA', 'ARVN', 'US', 'VC'] },
  { id: 'card-49', order: 49, title: 'Russian Arms', factionOrder: ['NVA', 'ARVN', 'VC', 'US'] },
  { id: 'card-52', order: 52, title: 'RAND', factionOrder: ['NVA', 'VC', 'US', 'ARVN'] },
  { id: 'card-54', order: 54, title: 'Son Tay', factionOrder: ['NVA', 'VC', 'US', 'ARVN'] },
  { id: 'card-57', order: 57, title: 'International Unrest', factionOrder: ['NVA', 'VC', 'ARVN', 'US'] },
  { id: 'card-58', order: 58, title: 'Pathet Lao', factionOrder: ['NVA', 'VC', 'ARVN', 'US'] },
  { id: 'card-60', order: 60, title: 'War Photographer', factionOrder: ['NVA', 'VC', 'ARVN', 'US'] },
] as const;

describe('FITL 1968 NVA-first event-card production spec', () => {
  it('compiles all 15 NVA-first 1968 cards with dual-side metadata invariants', () => {
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

  it('encodes 1968 NVA capability cards as capability marker toggles for both sides', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const expectedCapabilities = [
      { id: 'card-32', marker: 'cap_longRangeGuns' },
      { id: 'card-33', marker: 'cap_migs' },
      { id: 'card-45', marker: 'cap_pt76' },
    ] as const;

    for (const expected of expectedCapabilities) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined);
      assert.equal(card?.tags?.includes('capability'), true, `${expected.id} must include capability tag`);
      assert.equal(card?.tags?.includes('NVA'), true, `${expected.id} must include NVA tag`);
      assert.deepEqual(card?.unshaded?.effects, [{ setGlobalMarker: { marker: expected.marker, state: 'unshaded' } }]);
      assert.deepEqual(card?.shaded?.effects, [{ setGlobalMarker: { marker: expected.marker, state: 'shaded' } }]);
    }
  });

  it('encodes card 41 (Bombing Pause) as unshaded round momentum toggle', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-41');
    assert.notEqual(card, undefined);
    assert.equal(card?.tags?.includes('momentum'), true);

    const momentum = card?.unshaded?.lastingEffects?.find((effect) => effect.id === 'mom-bombing-pause');
    assert.notEqual(momentum, undefined);
    assert.equal(momentum?.duration, 'round');
    assert.deepEqual(momentum?.setupEffects, [{ setVar: { scope: 'global', var: 'mom_bombingPause', value: true } }]);
    assert.deepEqual(momentum?.teardownEffects, [{ setVar: { scope: 'global', var: 'mom_bombingPause', value: false } }]);
  });

  it('encodes card 52 (RAND) with generic capability-side flip over active global markers', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-52');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'RAND');
    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.factionOrder, ['NVA', 'VC', 'US', 'ARVN']);
    assert.equal(typeof card?.unshaded?.text, 'string');
    assert.equal(typeof card?.shaded?.text, 'string');
    const unshadedChoose = (
      card?.unshaded?.effects?.[0] as {
        chooseOne?: { internalDecisionId?: string; bind?: string; options?: { query?: string; states?: string[] } };
      }
    )?.chooseOne;
    assert.equal(typeof unshadedChoose?.internalDecisionId, 'string');
    assert.equal(unshadedChoose?.bind, '$randCapabilityMarker');
    assert.equal(unshadedChoose?.options?.query, 'globalMarkers');
    assert.deepEqual(unshadedChoose?.options?.states, ['unshaded', 'shaded']);
    assert.deepEqual((card?.unshaded?.effects?.[1] as { flipGlobalMarker?: unknown })?.flipGlobalMarker, {
      marker: { ref: 'binding', name: '$randCapabilityMarker' },
      stateA: 'unshaded',
      stateB: 'shaded',
    });

    const shadedChoose = (
      card?.shaded?.effects?.[0] as {
        chooseOne?: { internalDecisionId?: string; bind?: string; options?: { query?: string; states?: string[] } };
      }
    )?.chooseOne;
    assert.equal(typeof shadedChoose?.internalDecisionId, 'string');
    assert.equal(shadedChoose?.bind, '$randCapabilityMarker');
    assert.equal(shadedChoose?.options?.query, 'globalMarkers');
    assert.deepEqual(shadedChoose?.options?.states, ['unshaded', 'shaded']);
    assert.deepEqual((card?.shaded?.effects?.[1] as { flipGlobalMarker?: unknown })?.flipGlobalMarker, {
      marker: { ref: 'binding', name: '$randCapabilityMarker' },
      stateA: 'unshaded',
      stateB: 'shaded',
    });
  });
});
