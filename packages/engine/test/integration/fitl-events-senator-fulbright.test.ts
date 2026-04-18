// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asTokenId } from '../../src/kernel/index.js';
import {
  assertEventText,
  countTokensInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
  tokenIdsInZone,
} from './fitl-events-test-helpers.js';

const CARD_ID = 'card-93';
const AVAILABLE_US = 'available-US:none';
const OUT_OF_PLAY_US = 'out-of-play-US:none';
const TAY_NINH = 'tay-ninh:none';
const KIEN_PHONG = 'kien-phong:none';
const DA_NANG = 'da-nang:none';

describe('FITL card-93 Senator Fulbright', () => {
  // ── Compilation tests ──

  it('compiles with correct metadata, text, and structure', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assertEventText(def, CARD_ID, {
      title: 'Senator Fulbright',
      unshaded: 'US moves 4 US pieces from map to Available.',
      shaded: '1 Available US Base out of play. Aid -9.',
    });
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1964');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'US', 'NVA', 'ARVN']);

    const serializedUnshaded = JSON.stringify(card.unshaded?.effects ?? []);
    assert.match(serializedUnshaded, /chooseN/, 'Unshaded should use chooseN');
    assert.match(serializedUnshaded, /tokensInMapSpaces/, 'Unshaded should query tokensInMapSpaces');

    const serializedShaded = JSON.stringify(card.shaded?.effects ?? []);
    assert.match(serializedShaded, /removeByPriority/, 'Shaded should use removeByPriority');
    assert.match(serializedShaded, /-9/, 'Shaded should reduce aid by 9');
  });

  // ── Unshaded behavioral tests ──

  it('unshaded moves 4 chosen US pieces from map to Available', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 93001,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [TAY_NINH]: [
          makeFitlToken('ful-us-troop-1', 'troops', 'US'),
          makeFitlToken('ful-us-troop-2', 'troops', 'US'),
          makeFitlToken('ful-us-base-1', 'base', 'US'),
        ],
        [KIEN_PHONG]: [
          makeFitlToken('ful-us-irreg-1', 'irregular', 'US'),
          makeFitlToken('ful-us-irreg-2', 'irregular', 'US'),
        ],
        [DA_NANG]: [
          makeFitlToken('ful-us-troop-3', 'troops', 'US'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (request) => request.name === '$fulbrightPiecesToAvailable',
          value: [
            asTokenId('ful-us-troop-1'),
            asTokenId('ful-us-base-1'),
            asTokenId('ful-us-irreg-1'),
            asTokenId('ful-us-troop-3'),
          ],
        },
      ],
    }).state;

    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-us-troop-1'), true, 'Chosen troop-1 should be in Available');
    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-us-base-1'), true, 'Chosen base-1 should be in Available');
    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-us-irreg-1'), true, 'Chosen irreg-1 should be in Available');
    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-us-troop-3'), true, 'Chosen troop-3 should be in Available');
    assert.equal(tokenIdsInZone(final, TAY_NINH).has('ful-us-troop-2'), true, 'Unchosen troop-2 should remain on map');
    assert.equal(tokenIdsInZone(final, KIEN_PHONG).has('ful-us-irreg-2'), true, 'Unchosen irreg-2 should remain on map');
  });

  it('unshaded allows freely choosing mixed types including bases', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 93002,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [TAY_NINH]: [
          makeFitlToken('ful-mix-base-1', 'base', 'US'),
          makeFitlToken('ful-mix-base-2', 'base', 'US'),
          makeFitlToken('ful-mix-troop-1', 'troops', 'US'),
          makeFitlToken('ful-mix-irreg-1', 'irregular', 'US'),
          makeFitlToken('ful-mix-troop-2', 'troops', 'US'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (request) => request.name === '$fulbrightPiecesToAvailable',
          value: [
            asTokenId('ful-mix-base-1'),
            asTokenId('ful-mix-base-2'),
            asTokenId('ful-mix-troop-1'),
            asTokenId('ful-mix-irreg-1'),
          ],
        },
      ],
    }).state;

    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-mix-base-1'), true, 'Base 1 should move to Available');
    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-mix-base-2'), true, 'Base 2 should move to Available');
    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-mix-troop-1'), true, 'Troop should move to Available');
    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-mix-irreg-1'), true, 'Irregular should move to Available');
    assert.equal(tokenIdsInZone(final, TAY_NINH).has('ful-mix-troop-2'), true, 'Unchosen troop-2 stays on map');
  });

  it('unshaded partial execution: moves only 2 when only 2 US pieces exist on map', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 93003,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [TAY_NINH]: [
          makeFitlToken('ful-partial-1', 'troops', 'US'),
          makeFitlToken('ful-partial-2', 'irregular', 'US'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (request) => request.name === '$fulbrightPiecesToAvailable',
          value: [
            asTokenId('ful-partial-1'),
            asTokenId('ful-partial-2'),
          ],
        },
      ],
    }).state;

    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-partial-1'), true);
    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-partial-2'), true);
    assert.equal(countTokensInZone(final, TAY_NINH, (t) => t.props.faction === 'US'), 0, 'No US pieces should remain');
  });

  it('unshaded picks from multiple spaces', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 93005,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [TAY_NINH]: [
          makeFitlToken('ful-multi-a1', 'troops', 'US'),
          makeFitlToken('ful-multi-a2', 'troops', 'US'),
        ],
        [KIEN_PHONG]: [
          makeFitlToken('ful-multi-b1', 'base', 'US'),
        ],
        [DA_NANG]: [
          makeFitlToken('ful-multi-c1', 'irregular', 'US'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (request) => request.name === '$fulbrightPiecesToAvailable',
          value: [
            asTokenId('ful-multi-a1'),
            asTokenId('ful-multi-b1'),
            asTokenId('ful-multi-c1'),
            asTokenId('ful-multi-a2'),
          ],
        },
      ],
    }).state;

    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-multi-a1'), true, 'Piece from Tay Ninh moved');
    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-multi-a2'), true, 'Second piece from Tay Ninh moved');
    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-multi-b1'), true, 'Piece from Kien Phong moved');
    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-multi-c1'), true, 'Piece from Da Nang moved');
  });

  // ── Shaded behavioral tests ──

  it('shaded moves 1 Available US Base to out-of-play and reduces Aid by 9', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 93006,
      activePlayer: 3,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { aid: 20 },
      zoneTokens: {
        [AVAILABLE_US]: [
          makeFitlToken('ful-shade-base-1', 'base', 'US'),
          makeFitlToken('ful-shade-base-2', 'base', 'US'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'shaded').state;

    const basesInOop = (final.zones[OUT_OF_PLAY_US] ?? []).filter(
      (t) => (t as { props: Record<string, unknown> }).props.type === 'base' && (t as { props: Record<string, unknown> }).props.faction === 'US',
    );
    assert.equal(basesInOop.length, 1, 'Exactly 1 US base should move to out-of-play');
    const basesStillAvail = (final.zones[AVAILABLE_US] ?? []).filter(
      (t) => (t as { props: Record<string, unknown> }).props.type === 'base' && (t as { props: Record<string, unknown> }).props.faction === 'US',
    );
    assert.equal(basesStillAvail.length, 1, '1 US base should remain in Available');
    assert.equal(final.globalVars.aid, 11, 'Aid should be 20 - 9 = 11');
  });

  it('shaded moves the only Available US Base to out-of-play', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 93007,
      activePlayer: 3,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { aid: 15 },
      zoneTokens: {
        [AVAILABLE_US]: [
          makeFitlToken('ful-shade-solo', 'base', 'US'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'shaded').state;

    assert.equal(tokenIdsInZone(final, OUT_OF_PLAY_US).has('ful-shade-solo'), true, 'The sole US base should move to out-of-play');
    assert.equal(countTokensInZone(final, AVAILABLE_US, (t) => t.props.type === 'base' && t.props.faction === 'US'), 0, 'No US bases should remain in Available');
    assert.equal(final.globalVars.aid, 6, 'Aid should be 15 - 9 = 6');
  });

  it('shaded still reduces Aid by 9 when no Available US Base exists', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 93008,
      activePlayer: 3,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { aid: 20 },
      zoneTokens: {
        [AVAILABLE_US]: [
          makeFitlToken('ful-shade-troop-only', 'troops', 'US'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'shaded').state;

    assert.equal(countTokensInZone(final, OUT_OF_PLAY_US, (t) => t.props.type === 'base'), 0, 'No base should move to out-of-play');
    assert.equal(tokenIdsInZone(final, AVAILABLE_US).has('ful-shade-troop-only'), true, 'Non-base US piece stays in Available');
    assert.equal(final.globalVars.aid, 11, 'Aid should still reduce by 9');
  });

  it('shaded clamps Aid at variable lower bound when delta exceeds current value', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 93009,
      activePlayer: 3,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { aid: 5 },
      zoneTokens: {
        [AVAILABLE_US]: [
          makeFitlToken('ful-shade-clamp-base', 'base', 'US'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'shaded').state;

    assert.equal(tokenIdsInZone(final, OUT_OF_PLAY_US).has('ful-shade-clamp-base'), true);
    const aidValue = final.globalVars.aid;
    assert.ok(aidValue !== undefined, 'Aid should be defined');
    assert.ok(Number(aidValue) >= 0, 'Aid should not go below 0');
  });
});
