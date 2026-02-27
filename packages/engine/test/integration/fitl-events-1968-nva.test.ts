import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-32', order: 32, title: 'Long Range Guns', seatOrder: ['NVA', 'US', 'ARVN', 'VC'] },
  { id: 'card-33', order: 33, title: 'MiGs', seatOrder: ['NVA', 'US', 'ARVN', 'VC'] },
  { id: 'card-35', order: 35, title: 'Thanh Hoa', seatOrder: ['NVA', 'US', 'ARVN', 'VC'] },
  { id: 'card-36', order: 36, title: 'Hamburger Hill', seatOrder: ['NVA', 'US', 'VC', 'ARVN'] },
  { id: 'card-37', order: 37, title: 'Khe Sanh', seatOrder: ['NVA', 'US', 'VC', 'ARVN'] },
  { id: 'card-40', order: 40, title: 'PoWs', seatOrder: ['NVA', 'US', 'VC', 'ARVN'] },
  { id: 'card-41', order: 41, title: 'Bombing Pause', seatOrder: ['NVA', 'ARVN', 'US', 'VC'] },
  { id: 'card-42', order: 42, title: 'Chou En Lai', seatOrder: ['NVA', 'ARVN', 'US', 'VC'] },
  { id: 'card-45', order: 45, title: 'PT-76', seatOrder: ['NVA', 'ARVN', 'US', 'VC'] },
  { id: 'card-49', order: 49, title: 'Russian Arms', seatOrder: ['NVA', 'ARVN', 'VC', 'US'] },
  { id: 'card-52', order: 52, title: 'RAND', seatOrder: ['NVA', 'VC', 'US', 'ARVN'] },
  { id: 'card-54', order: 54, title: 'Son Tay', seatOrder: ['NVA', 'VC', 'US', 'ARVN'] },
  { id: 'card-57', order: 57, title: 'International Unrest', seatOrder: ['NVA', 'VC', 'ARVN', 'US'] },
  { id: 'card-58', order: 58, title: 'Pathet Lao', seatOrder: ['NVA', 'VC', 'ARVN', 'US'] },
  { id: 'card-60', order: 60, title: 'War Photographer', seatOrder: ['NVA', 'VC', 'ARVN', 'US'] },
] as const;

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const makeToken = (id: string, type: string, faction: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type },
});

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
      assert.deepEqual(card?.metadata?.seatOrder, expected.seatOrder);
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

  it('encodes MiGs shaded with Top Gun unshaded cancellation guard', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-33');
    assert.notEqual(card, undefined);
    assert.deepEqual((card?.unshaded?.effects?.[0] as { setGlobalMarker?: unknown })?.setGlobalMarker, {
      marker: 'cap_migs',
      state: 'unshaded',
    });
    const shadedIf = (card?.shaded?.effects?.[0] as { if?: { then?: unknown[]; else?: unknown[] } })?.if;
    assert.notEqual(shadedIf, undefined);
    assert.deepEqual((shadedIf?.then?.[0] as { setGlobalMarker?: unknown })?.setGlobalMarker, {
      marker: 'cap_migs',
      state: 'inactive',
    });
    assert.deepEqual((shadedIf?.else?.[0] as { setGlobalMarker?: unknown })?.setGlobalMarker, {
      marker: 'cap_migs',
      state: 'shaded',
    });
  });

  it('blocks MiGs shaded execution when Top Gun unshaded is already active', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const start = clearAllZones(initialState(def, 196833, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(2),
      turnOrderState: { type: 'roundRobin' },
      globalMarkers: {
        ...start.globalMarkers,
        cap_topGun: 'unshaded',
      },
      zones: {
        ...start.zones,
        [eventDeck!.discardZone]: [makeToken('card-33', 'card', 'none')],
      },
    };

    const move = legalMoves(def, configured).find(
      (candidate) =>
        String(candidate.actionId) === 'event' &&
        candidate.params.eventCardId === 'card-33' &&
        candidate.params.side === 'shaded',
    );
    assert.notEqual(move, undefined, 'Expected legal MiGs shaded event move');

    const after = applyMove(def, configured, move!).state;
    assert.notEqual(after.globalMarkers, undefined);
    assert.equal(after.globalMarkers?.cap_topGun, 'unshaded');
    assert.equal(after.globalMarkers?.cap_migs, 'inactive');
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
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'VC', 'US', 'ARVN']);
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
