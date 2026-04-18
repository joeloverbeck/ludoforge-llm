// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findDeep } from '../helpers/ast-search-helpers.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  assertEventText,
  countTokensInZone,
  findTokenInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
  tokenIdsInZone,
} from './fitl-events-test-helpers.js';

const CARD_ID = 'card-89';
const SAIGON = 'saigon:none';
const QUANG_NAM = 'quang-nam:none';

describe('FITL card-89 Tam Chau', () => {
  it('compiles exact text and encodes passive-targeted support routing plus VC piece sourcing from available or map', () => {
    const fixture = compileProductionSpec();

    assertNoErrors(fixture.parsed);
    assert.notEqual(fixture.compiled.gameDef, null);

    const def = fixture.compiled.gameDef!;
    const card = getEventCard(def, CARD_ID);
    const parsedCard = fixture.parsed.doc.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.ok(parsedCard, 'Expected parsed Tam Chau card');

    assertEventText(def, CARD_ID, {
      title: 'Tam Chau',
      unshaded: 'Shift Saigon 1 level toward Passive Support. Patronage +6.',
      shaded: 'Place a VC piece in Saigon and shift Saigon 1 level toward Passive Opposition. Patronage -6.',
    });
    assert.equal(card.metadata?.period, '1965');
    assert.deepEqual(card.metadata?.seatOrder, ['ARVN', 'VC', 'NVA', 'US']);

    const parsedJson = JSON.stringify(parsedCard.shaded?.effects ?? []);
    assert.match(parsedJson, /available-VC:none/, 'Shaded must source VC pieces from Available when possible');
    assert.match(parsedJson, /tokensInMapSpaces/, 'Shaded must fall back to map sourcing when the chosen type is unavailable');
    assert.match(parsedJson, /"tunnel".*"untunneled"/, 'Shaded must strip tunnel status when sourcing a tunneled VC base from the map');

    const unshadedJson = JSON.stringify(card.unshaded?.effects ?? []);
    assert.match(unshadedJson, /"passiveOpposition"/);
    assert.match(unshadedJson, /"activeOpposition"/);
    assert.match(unshadedJson, /"activeSupport"/);
    assert.match(unshadedJson, /"delta":6/);

    const shadedJson = JSON.stringify(card.shaded?.effects ?? []);
    assert.match(shadedJson, /"passiveSupport"/);
    assert.match(shadedJson, /"activeSupport"/);
    assert.match(shadedJson, /"activeOpposition"/);
    assert.match(shadedJson, /"delta":-6/);

    const chooseCalls = findDeep(parsedCard.shaded ?? {}, (node) => typeof node.chooseN === 'object');
    assert.equal(chooseCalls.length >= 1, true, 'Shaded should explicitly select a single VC piece');
  });

  it('unshaded shifts Neutral Saigon to Passive Support and adds Patronage +6', () => {
    const def = getFitlEventDef();
    const setup = setupFitlEventState(def, {
      seed: 89001,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 14 },
      markers: { [SAIGON]: { supportOpposition: 'neutral' } },
    });

    const final = runEvent(def, setup, CARD_ID, 'unshaded').state;

    assert.equal(final.markers[SAIGON]?.supportOpposition, 'passiveSupport');
    assert.equal(final.globalVars.patronage, 20);
  });

  it('unshaded pulls Active Support back to Passive Support and clamps Patronage at 75', () => {
    const def = getFitlEventDef();
    const setup = setupFitlEventState(def, {
      seed: 89002,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 74 },
      markers: { [SAIGON]: { supportOpposition: 'activeSupport' } },
    });

    const final = runEvent(def, setup, CARD_ID, 'unshaded').state;

    assert.equal(final.markers[SAIGON]?.supportOpposition, 'passiveSupport');
    assert.equal(final.globalVars.patronage, 75);
  });

  it('shaded places an available VC guerrilla underground in Saigon, shifts toward Passive Opposition, and reduces Patronage by 6', () => {
    const def = getFitlEventDef();
    const setup = setupFitlEventState(def, {
      seed: 89003,
      activePlayer: 3,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 18 },
      markers: { [SAIGON]: { supportOpposition: 'neutral' } },
      zoneTokens: {
        [SAIGON]: [makeFitlToken('tam-chau-existing-us-base', 'base', 'US')],
        'available-VC:none': [
          makeFitlToken('tam-chau-vc-g', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('tam-chau-vc-b', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
    });

    const final = runEvent(def, setup, CARD_ID, 'shaded', {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$tamChauVcPiece', resolvedBind: '$tamChauVcPiece' }),
          value: ['tam-chau-vc-g'],
        },
      ],
    }).state;

    assert.equal(final.markers[SAIGON]?.supportOpposition, 'passiveOpposition');
    assert.equal(final.globalVars.patronage, 12);
    assert.equal(tokenIdsInZone(final, SAIGON).has('tam-chau-vc-g'), true);
    assert.equal(countTokensInZone(final, 'available-VC:none', (token) => String(token.id) === 'tam-chau-vc-g'), 0);
    assert.equal(findTokenInZone(final, SAIGON, 'tam-chau-vc-g')?.props.activity, 'underground');
  });

  it('shaded allows a base as the placed VC piece, sourcing it from the map when none are available and stripping tunnel status', () => {
    const def = getFitlEventDef();
    const setup = setupFitlEventState(def, {
      seed: 89004,
      activePlayer: 3,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 4 },
      markers: { [SAIGON]: { supportOpposition: 'activeOpposition' } },
      zoneTokens: {
        [SAIGON]: [makeFitlToken('tam-chau-saigon-us-base', 'base', 'US')],
        [QUANG_NAM]: [makeFitlToken('tam-chau-map-vc-base', 'base', 'VC', { tunnel: 'tunneled' })],
        'available-VC:none': [],
      },
    });

    const final = runEvent(def, setup, CARD_ID, 'shaded', {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$tamChauVcPiece', resolvedBind: '$tamChauVcPiece' }),
          value: ['tam-chau-map-vc-base'],
        },
      ],
    }).state;

    assert.equal(tokenIdsInZone(final, SAIGON).has('tam-chau-map-vc-base'), true);
    assert.equal(tokenIdsInZone(final, QUANG_NAM).has('tam-chau-map-vc-base'), false);
    assert.equal(findTokenInZone(final, SAIGON, 'tam-chau-map-vc-base')?.props.tunnel, 'untunneled');
    assert.equal(final.markers[SAIGON]?.supportOpposition, 'passiveOpposition');
    assert.equal(final.globalVars.patronage, 0, 'Patronage should clamp at the floor');
  });

  it('shaded respects the two-base stacking cap in Saigon and still applies the shift and Patronage loss when only bases are otherwise available', () => {
    const def = getFitlEventDef();
    const setup = setupFitlEventState(def, {
      seed: 89005,
      activePlayer: 3,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 22 },
      markers: { [SAIGON]: { supportOpposition: 'passiveSupport' } },
      zoneTokens: {
        [SAIGON]: [
          makeFitlToken('tam-chau-saigon-base-1', 'base', 'US'),
          makeFitlToken('tam-chau-saigon-base-2', 'base', 'ARVN'),
        ],
        'available-VC:none': [makeFitlToken('tam-chau-capped-vc-base', 'base', 'VC', { tunnel: 'untunneled' })],
      },
    });

    const final = runEvent(def, setup, CARD_ID, 'shaded').state;

    assert.equal(tokenIdsInZone(final, SAIGON).has('tam-chau-capped-vc-base'), false, 'VC base must not exceed Saigon base cap');
    assert.equal(tokenIdsInZone(final, 'available-VC:none').has('tam-chau-capped-vc-base'), true, 'Unplaceable base should remain Available');
    assert.equal(final.markers[SAIGON]?.supportOpposition, 'neutral');
    assert.equal(final.globalVars.patronage, 16);
  });
});
