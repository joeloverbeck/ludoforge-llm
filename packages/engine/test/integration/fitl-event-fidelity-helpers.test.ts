import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertEventText,
  assertNoOpEvent,
  findEventMove,
  getEventCard,
  getFitlEventDef,
  getFitlEventFixture,
  makeFitlToken,
  setupFitlEventState,
  tokenIdsInZone,
} from './fitl-events-test-helpers.js';

const CARD_ID = 'card-81';
const NON_HIGHLAND = 'tay-ninh:none';

describe('FITL event fidelity helpers', () => {
  it('reuses the cached FITL production fixture and exposes cards by id', () => {
    const fixture = getFitlEventFixture();
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(fixture.gameDef, def);
    assert.equal(card.id, CARD_ID);
    assert.equal(card.title, 'CIDG');
  });

  it('builds FITL tokens and isolated event states with discard-zone card placement', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 81001,
      activePlayer: 2,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { testCounter: 3 },
      zoneTokens: {
        [NON_HIGHLAND]: [makeFitlToken('helper-irregular', 'irregular', 'US', { activity: 'active' })],
      },
    });
    const eventDeck = def.eventDecks?.[0];

    assert.notEqual(eventDeck, undefined);
    assert.equal(Number(state.activePlayer), 2);
    assert.equal(state.globalVars.testCounter, 3);
    assert.deepEqual(
      state.zones[NON_HIGHLAND],
      [makeFitlToken('helper-irregular', 'irregular', 'US', { activity: 'active' })],
    );
    assert.equal(tokenIdsInZone(state, eventDeck!.discardZone).has(CARD_ID), true);
  });

  it('finds event moves, asserts exact event text, and proves no-op behavior', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 81141,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [NON_HIGHLAND]: [
          makeFitlToken('cidg-noop-irregular', 'irregular', 'US', { activity: 'active' }),
          makeFitlToken('cidg-noop-police', 'police', 'ARVN', { activity: 'active' }),
        ],
        'available-VC:none': [makeFitlToken('cidg-noop-vc', 'guerrilla', 'VC', { activity: 'active' })],
      },
    });

    assertEventText(def, CARD_ID, {
      title: 'CIDG',
      unshaded: 'Replace a die roll of VC Guerrillas in South Vietnam with Rangers, Irregulars, or Police.',
      shaded: 'Replace all Rangers, Police, and Irregulars in a Highland space with 2 VC Guerrillas total.',
    });

    assert.notEqual(findEventMove(def, state, CARD_ID, 'shaded'), undefined);
    assertNoOpEvent(def, state, CARD_ID, 'shaded');
  });
});
