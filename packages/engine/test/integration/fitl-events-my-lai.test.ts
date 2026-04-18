// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  assertEventText,
  countTokensInZone,
  findEventMove,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
} from './fitl-events-test-helpers.js';

const CARD_ID = 'card-119';
const PROVINCE_A = 'tay-ninh:none';
const POP0_PROVINCE = 'central-laos:none';

describe('FITL card-119 My Lai', () => {
  // ─── Metadata & compilation ───

  it('compiles with correct text, metadata, and structural markers', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null, 'Expected valid GameDef');

    const def = compiled.gameDef!;
    const card = getEventCard(def, CARD_ID);

    assertEventText(def, CARD_ID, {
      title: 'My Lai',
      unshaded: '2 Available US Troops out of play. Patronage +2.',
      shaded: 'Set a Province with US Troops to Active Opposition. VC place a Base and Guerrilla there. Aid -6.',
    });
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1968');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'ARVN', 'NVA', 'US']);

    const serializedUnshaded = JSON.stringify(card.unshaded?.effects ?? []);
    assert.match(serializedUnshaded, /"out-of-play-US:none"/, 'Unshaded should move troops to out-of-play');
    assert.match(serializedUnshaded, /"value":"troops"/, 'Unshaded should filter US troops');
    assert.match(serializedUnshaded, /"var":"patronage"/, 'Unshaded should modify patronage');

    const serializedShaded = JSON.stringify(card.shaded?.targets ?? []);
    assert.match(serializedShaded, /activeOpposition/, 'Shaded should set marker to activeOpposition');
    assert.match(serializedShaded, /"var":"aid"/, 'Shaded should modify aid');
  });

  // ─── Unshaded tests ───

  it('unshaded happy path: 2 Available US Troops moved to out-of-play, Patronage +2', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 119001,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'available-US:none': [
          makeFitlToken('ml-us-troop-1', 'troops', 'US'),
          makeFitlToken('ml-us-troop-2', 'troops', 'US'),
          makeFitlToken('ml-us-troop-3', 'troops', 'US'),
        ],
      },
      globalVars: { patronage: 10 },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded').state;

    assert.equal(
      countTokensInZone(final, 'available-US:none', (t) => t.props.faction === 'US' && t.type === 'troops'),
      1,
      'Available should have 1 US troop remaining',
    );
    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US' && t.type === 'troops'),
      2,
      'Out-of-play should have 2 US troops',
    );
    assert.equal(final.globalVars.patronage, 12, 'Patronage should increase from 10 to 12');
  });

  it('unshaded depletion: only 1 Available US Troop', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 119002,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'available-US:none': [
          makeFitlToken('ml-dep-troop-1', 'troops', 'US'),
        ],
      },
      globalVars: { patronage: 10 },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded').state;

    assert.equal(
      countTokensInZone(final, 'available-US:none', (t) => t.props.faction === 'US' && t.type === 'troops'),
      0,
      'Available should have 0 US troops',
    );
    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US' && t.type === 'troops'),
      1,
      'Out-of-play should have 1 US troop',
    );
    assert.equal(final.globalVars.patronage, 12, 'Patronage should still increase by 2');
  });

  it('unshaded empty pool: Patronage still increases when 0 troops available', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 119003,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {},
      globalVars: { patronage: 10 },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded').state;

    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US' && t.type === 'troops'),
      0,
      'No troops should be moved when none available',
    );
    assert.equal(final.globalVars.patronage, 12, 'Patronage should still increase by 2');
  });

  it('unshaded Patronage clamped at 75', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 119004,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {},
      globalVars: { patronage: 74 },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded').state;

    assert.equal(final.globalVars.patronage, 75, 'Patronage should clamp at 75');
  });

  it('unshaded Patronage at max stays at 75', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 119005,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {},
      globalVars: { patronage: 75 },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded').state;

    assert.equal(final.globalVars.patronage, 75, 'Patronage should stay at 75');
  });

  // ─── Shaded tests ───

  it('shaded happy path: Province set to Active Opposition, VC Base + Guerrilla placed, Aid -6', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 119010,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [PROVINCE_A]: [
          makeFitlToken('ml-sh-us-troop-1', 'troops', 'US'),
        ],
        'available-VC:none': [
          makeFitlToken('ml-sh-vc-base-1', 'base', 'VC', { tunnel: 'untunneled' }),
          makeFitlToken('ml-sh-vc-guerr-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      globalVars: { aid: 20 },
      markers: { [PROVINCE_A]: { supportOpposition: 'neutral' } },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$myLaiProvince', resolvedBind: '$myLaiProvince' }),
        value: PROVINCE_A,
      },
    ];
    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    assert.equal(
      final.markers[PROVINCE_A]?.['supportOpposition'],
      'activeOpposition',
      'Province should be set to Active Opposition',
    );
    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.props.faction === 'VC' && t.type === 'base'),
      1,
      'Province should have 1 VC base',
    );
    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      1,
      'Province should have 1 VC guerrilla',
    );
    assert.equal(final.globalVars.aid, 14, 'Aid should decrease from 20 to 14');
  });

  it('shaded Province already at Passive Opposition becomes Active Opposition', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 119011,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [PROVINCE_A]: [
          makeFitlToken('ml-po-us-troop-1', 'troops', 'US'),
        ],
        'available-VC:none': [
          makeFitlToken('ml-po-vc-base-1', 'base', 'VC', { tunnel: 'untunneled' }),
          makeFitlToken('ml-po-vc-guerr-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      globalVars: { aid: 20 },
      markers: { [PROVINCE_A]: { supportOpposition: 'passiveOpposition' } },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$myLaiProvince', resolvedBind: '$myLaiProvince' }),
        value: PROVINCE_A,
      },
    ];
    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    assert.equal(
      final.markers[PROVINCE_A]?.['supportOpposition'],
      'activeOpposition',
      'Province should be set to Active Opposition (not shifted, but set absolutely)',
    );
  });

  it('shaded Province at Active Support set to Active Opposition', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 119012,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [PROVINCE_A]: [
          makeFitlToken('ml-as-us-troop-1', 'troops', 'US'),
        ],
        'available-VC:none': [
          makeFitlToken('ml-as-vc-base-1', 'base', 'VC', { tunnel: 'untunneled' }),
          makeFitlToken('ml-as-vc-guerr-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      globalVars: { aid: 20 },
      markers: { [PROVINCE_A]: { supportOpposition: 'activeSupport' } },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$myLaiProvince', resolvedBind: '$myLaiProvince' }),
        value: PROVINCE_A,
      },
    ];
    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    assert.equal(
      final.markers[PROVINCE_A]?.['supportOpposition'],
      'activeOpposition',
      'Province should jump directly from Active Support to Active Opposition',
    );
  });

  it('shaded Pop 0 province excluded from selector', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 119013,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [POP0_PROVINCE]: [
          makeFitlToken('ml-pop0-us-troop-1', 'troops', 'US'),
        ],
        'available-VC:none': [
          makeFitlToken('ml-pop0-vc-base-1', 'base', 'VC', { tunnel: 'untunneled' }),
          makeFitlToken('ml-pop0-vc-guerr-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      globalVars: { aid: 20 },
    });

    const move = findEventMove(def, state, CARD_ID, 'shaded');
    assert.equal(move, undefined, 'Shaded should be unplayable when only Pop 0 provinces have US troops');
  });

  it('shaded stacking cap: 2 bases already present prevents VC Base placement', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 119014,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [PROVINCE_A]: [
          makeFitlToken('ml-stack-us-troop-1', 'troops', 'US'),
          makeFitlToken('ml-stack-base-1', 'base', 'VC', { tunnel: 'untunneled' }),
          makeFitlToken('ml-stack-base-2', 'base', 'ARVN', { tunnel: 'untunneled' }),
        ],
        'available-VC:none': [
          makeFitlToken('ml-stack-vc-base-1', 'base', 'VC', { tunnel: 'untunneled' }),
          makeFitlToken('ml-stack-vc-guerr-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      globalVars: { aid: 20 },
      markers: { [PROVINCE_A]: { supportOpposition: 'neutral' } },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$myLaiProvince', resolvedBind: '$myLaiProvince' }),
        value: PROVINCE_A,
      },
    ];
    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.type === 'base'),
      2,
      'Province should still have exactly 2 bases (stacking cap prevents new base)',
    );
    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      1,
      'VC guerrilla should still be placed despite stacking cap on bases',
    );
    assert.equal(final.globalVars.aid, 14, 'Aid should still decrease by 6');
  });

  it('shaded no available VC Base: Guerrilla still placed', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 119015,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [PROVINCE_A]: [
          makeFitlToken('ml-nobase-us-troop-1', 'troops', 'US'),
        ],
        'available-VC:none': [
          makeFitlToken('ml-nobase-vc-guerr-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      globalVars: { aid: 20 },
      markers: { [PROVINCE_A]: { supportOpposition: 'neutral' } },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$myLaiProvince', resolvedBind: '$myLaiProvince' }),
        value: PROVINCE_A,
      },
    ];
    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.props.faction === 'VC' && t.type === 'base'),
      0,
      'No VC base should be placed when none available',
    );
    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      1,
      'VC guerrilla should still be placed',
    );
    assert.equal(final.globalVars.aid, 14, 'Aid should still decrease by 6');
  });

  it('shaded no available VC Guerrilla: Base still placed', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 119016,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [PROVINCE_A]: [
          makeFitlToken('ml-noguerr-us-troop-1', 'troops', 'US'),
        ],
        'available-VC:none': [
          makeFitlToken('ml-noguerr-vc-base-1', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
      globalVars: { aid: 20 },
      markers: { [PROVINCE_A]: { supportOpposition: 'neutral' } },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$myLaiProvince', resolvedBind: '$myLaiProvince' }),
        value: PROVINCE_A,
      },
    ];
    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.props.faction === 'VC' && t.type === 'base'),
      1,
      'VC base should be placed',
    );
    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      0,
      'No VC guerrilla should be placed when none available',
    );
    assert.equal(final.globalVars.aid, 14, 'Aid should still decrease by 6');
  });

  it('shaded Aid clamped at 0', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 119017,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [PROVINCE_A]: [
          makeFitlToken('ml-aid0-us-troop-1', 'troops', 'US'),
        ],
        'available-VC:none': [
          makeFitlToken('ml-aid0-vc-base-1', 'base', 'VC', { tunnel: 'untunneled' }),
          makeFitlToken('ml-aid0-vc-guerr-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      globalVars: { aid: 3 },
      markers: { [PROVINCE_A]: { supportOpposition: 'neutral' } },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$myLaiProvince', resolvedBind: '$myLaiProvince' }),
        value: PROVINCE_A,
      },
    ];
    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    assert.equal(final.globalVars.aid, 0, 'Aid should clamp at 0 (not go to -3)');
  });
});
