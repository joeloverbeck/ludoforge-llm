import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, completeMoveDecisionSequence, legalChoicesEvaluate } from '../../src/kernel/index.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import {
  countTokensInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  requireEventMove,
  setupFitlEventState,
  tokenIdsInZone,
} from './fitl-events-test-helpers.js';
import { withNeutralSupportOppositionMarkers } from '../helpers/isolated-state-helpers.js';

const CARD_ID = 'card-87';
const HUE = 'hue:none';
const DA_NANG = 'da-nang:none';
const QUANG_NAM = 'quang-nam:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';
const CENTRAL_LAOS = 'central-laos:none';
const LOC_HUE_DA_NANG = 'loc-hue-da-nang:none';
const LOC_HUE_KHE_SANH = 'loc-hue-khe-sanh:none';
const AVAILABLE_ARVN = 'available-ARVN:none';
const AVAILABLE_VC = 'available-VC:none';

const supportState = (state: ReturnType<typeof setupFitlEventState>, zone: string): string =>
  String(state.markers[zone]?.supportOpposition ?? 'neutral');

describe('FITL card-87 Nguyen Chanh Thi', () => {
  it('compiles the exact rules text and declarative selectors for both sides', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(card.title, 'Nguyen Chanh Thi');
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1965');
    assert.deepEqual(card.metadata?.seatOrder, ['ARVN', 'VC', 'NVA', 'US']);
    assert.equal(card.unshaded?.text, 'Place 3 ARVN pieces within 3 spaces of Hue. Shift receiving spaces each 1 level toward Active Support.');
    assert.equal(card.shaded?.text, 'Replace any 2 ARVN with any 2 VC pieces within 2 spaces of Hue. Patronage +4 or -4.');

    const unshadedJson = JSON.stringify(card.unshaded?.effects ?? []);
    const shadedJson = JSON.stringify(card.shaded?.effects ?? []);
    assert.match(unshadedJson, /"bind":"\$nguyenChanhThiArvnPieces"/);
    assert.match(unshadedJson, /"available-ARVN:none"/);
    assert.match(unshadedJson, /"loc-da-nang-qui-nhon:none"/);
    assert.match(unshadedJson, /"field":\{"kind":"tokenZone"\}/);
    assert.match(unshadedJson, /"query":"tokenZones".*"dedupe":true/);
    assert.match(unshadedJson, /"marker":"supportOpposition".*"delta":1/);
    assert.match(shadedJson, /"bind":"\$nguyenChanhThiRemovedArvnPieces"/);
    assert.match(shadedJson, /"bind":"\$nguyenChanhThiVcPieces"/);
    assert.match(shadedJson, /"available-VC:none"/);
    assert.match(shadedJson, /"available-ARVN:none"/);
    assert.match(shadedJson, /\$nguyenChanhThiPatronageDirection/);
  });

  it('unshaded places up to 3 ARVN pieces within 3 spaces of Hue and shifts each receiving space only once', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 87001,
      cardIdInDiscardZone: CARD_ID,
    });
    const state = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'neutral' },
        [DA_NANG]: { supportOpposition: 'passiveSupport' },
        [LOC_HUE_DA_NANG]: { supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [AVAILABLE_ARVN]: [
          makeFitlToken('thi-arvn-police', 'police', 'ARVN'),
          makeFitlToken('thi-arvn-ranger', 'ranger', 'ARVN', { activity: 'active' }),
        ],
        [QUANG_NAM]: [makeFitlToken('thi-map-base', 'base', 'ARVN')],
      },
    };

    const move = requireEventMove(def, state, CARD_ID, 'unshaded');
    const pending = legalChoicesEvaluate(def, state, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected unshaded ARVN-piece selector.');
    assert.deepEqual(
      pending.options.map((option) => String(option.value)).sort(),
      ['thi-arvn-police', 'thi-arvn-ranger', 'thi-map-base'],
    );
    assert.equal(pending.min, 3);
    assert.equal(pending.max, 3);

    const final = applyMoveWithResolvedDecisionIds(def, state, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$nguyenChanhThiArvnPieces', resolvedBind: '$nguyenChanhThiArvnPieces' }),
          value: ['thi-arvn-police', 'thi-arvn-ranger', 'thi-map-base'],
        },
        {
          when: matchesDecisionRequest({ name: '$nguyenChanhThiDestination', resolvedBind: '$nguyenChanhThiDestination', iterationPath: '[0]' }),
          value: HUE,
        },
        {
          when: matchesDecisionRequest({ name: '$nguyenChanhThiDestination', resolvedBind: '$nguyenChanhThiDestination', iterationPath: '[1]' }),
          value: HUE,
        },
        {
          when: matchesDecisionRequest({ name: '$nguyenChanhThiDestination', resolvedBind: '$nguyenChanhThiDestination', iterationPath: '[2]' }),
          value: DA_NANG,
        },
      ],
    }).state;

    assert.equal(tokenIdsInZone(final, HUE).has('thi-arvn-police'), true);
    assert.equal(tokenIdsInZone(final, HUE).has('thi-arvn-ranger'), true);
    assert.equal(tokenIdsInZone(final, DA_NANG).has('thi-map-base'), true);
    assert.equal(supportState(final, HUE), 'passiveSupport', 'Hue should shift only once despite receiving 2 pieces');
    assert.equal(supportState(final, DA_NANG), 'activeSupport');
    assert.equal(supportState(final, LOC_HUE_DA_NANG), 'neutral');
  });

  it('unshaded still allows LoC destinations but never shifts LoCs or Pop-0 provinces', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 87002,
      cardIdInDiscardZone: CARD_ID,
    });
    const state = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [LOC_HUE_DA_NANG]: { supportOpposition: 'neutral' },
        [CENTRAL_LAOS]: { supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [AVAILABLE_ARVN]: [
          makeFitlToken('thi-av-police', 'police', 'ARVN'),
          makeFitlToken('thi-av-troop', 'troops', 'ARVN'),
          makeFitlToken('thi-av-base', 'base', 'ARVN'),
        ],
      },
    };

    const move = requireEventMove(def, state, CARD_ID, 'unshaded');
    const final = applyMoveWithResolvedDecisionIds(def, state, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$nguyenChanhThiArvnPieces', resolvedBind: '$nguyenChanhThiArvnPieces' }),
          value: ['thi-av-police', 'thi-av-troop', 'thi-av-base'],
        },
        {
          when: matchesDecisionRequest({ name: '$nguyenChanhThiDestination', resolvedBind: '$nguyenChanhThiDestination', iterationPath: '[0]' }),
          value: LOC_HUE_DA_NANG,
        },
        {
          when: matchesDecisionRequest({ name: '$nguyenChanhThiDestination', resolvedBind: '$nguyenChanhThiDestination', iterationPath: '[1]' }),
          value: LOC_HUE_KHE_SANH,
        },
        {
          when: matchesDecisionRequest({ name: '$nguyenChanhThiDestination', resolvedBind: '$nguyenChanhThiDestination', iterationPath: '[2]' }),
          value: CENTRAL_LAOS,
        },
      ],
    }).state;

    assert.equal(tokenIdsInZone(final, LOC_HUE_DA_NANG).has('thi-av-police'), true);
    assert.equal(tokenIdsInZone(final, LOC_HUE_KHE_SANH).has('thi-av-troop'), true);
    assert.equal(tokenIdsInZone(final, CENTRAL_LAOS).has('thi-av-base'), true);
    assert.equal(supportState(final, LOC_HUE_DA_NANG), 'neutral');
    assert.equal(supportState(final, LOC_HUE_KHE_SANH), 'neutral');
    assert.equal(supportState(final, CENTRAL_LAOS), 'neutral');
  });

  it('unshaded base destination options exclude LoCs while non-bases may still use them', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 87005,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_ARVN]: [makeFitlToken('thi-only-base', 'base', 'ARVN')],
      },
    });

    const move = requireEventMove(def, state, CARD_ID, 'unshaded');
    const pending = completeMoveDecisionSequence(def, state, move, {
      choose: (request) => (
        matchesDecisionRequest({ name: '$nguyenChanhThiArvnPieces', resolvedBind: '$nguyenChanhThiArvnPieces' })(request)
          ? ['thi-only-base']
          : undefined
      ),
    });

    assert.equal(pending.complete, false);
    assert.equal(pending.nextDecision?.name, '$nguyenChanhThiDestination');
    assert.equal(
      pending.nextDecision?.options.some((option) => String(option.value) === LOC_HUE_DA_NANG),
      false,
    );
    assert.equal(
      pending.nextDecision?.options.some((option) => String(option.value) === LOC_HUE_KHE_SANH),
      false,
    );
    assert.equal(
      pending.nextDecision?.options.some((option) => String(option.value) === CENTRAL_LAOS),
      true,
    );
  });

  it('shaded removes up to 2 ARVN within 2 spaces of Hue, places selected VC pieces into affected spaces, and applies patronage direction', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 87003,
      cardIdInDiscardZone: CARD_ID,
      globalVars: {
        patronage: 5,
      },
      zoneTokens: {
        [HUE]: [makeFitlToken('thi-shaded-arvn-hue', 'police', 'ARVN')],
        [QUANG_TRI]: [makeFitlToken('thi-shaded-arvn-qt', 'troops', 'ARVN')],
        [AVAILABLE_VC]: [
          makeFitlToken('thi-vc-base', 'base', 'VC'),
          makeFitlToken('thi-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const move = requireEventMove(def, state, CARD_ID, 'shaded');
    const pending = legalChoicesEvaluate(def, state, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected shaded ARVN selector.');
    assert.deepEqual(pending.options.map((option) => String(option.value)).sort(), ['thi-shaded-arvn-hue', 'thi-shaded-arvn-qt']);

    const final = applyMoveWithResolvedDecisionIds(def, state, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$nguyenChanhThiRemovedArvnPieces', resolvedBind: '$nguyenChanhThiRemovedArvnPieces' }),
          value: ['thi-shaded-arvn-hue', 'thi-shaded-arvn-qt'],
        },
        {
          when: matchesDecisionRequest({ name: '$nguyenChanhThiVcPieces', resolvedBind: '$nguyenChanhThiVcPieces' }),
          value: ['thi-vc-base', 'thi-vc-guerrilla'],
        },
        {
          when: matchesDecisionRequest({ name: '$nguyenChanhThiVcDestination', resolvedBind: '$nguyenChanhThiVcDestination', iterationPath: '[1][0]' }),
          value: HUE,
        },
        {
          when: matchesDecisionRequest({ name: '$nguyenChanhThiVcDestination', resolvedBind: '$nguyenChanhThiVcDestination', iterationPath: '[1][1]' }),
          value: QUANG_TRI,
        },
        {
          when: matchesDecisionRequest({ name: '$nguyenChanhThiPatronageDirection', resolvedBind: '$nguyenChanhThiPatronageDirection' }),
          value: 'decrease',
        },
      ],
    }).state;

    assert.equal(tokenIdsInZone(final, HUE).has('thi-shaded-arvn-hue'), false);
    assert.equal(tokenIdsInZone(final, QUANG_TRI).has('thi-shaded-arvn-qt'), false);
    assert.equal(tokenIdsInZone(final, AVAILABLE_ARVN).has('thi-shaded-arvn-hue'), true);
    assert.equal(tokenIdsInZone(final, AVAILABLE_ARVN).has('thi-shaded-arvn-qt'), true);
    assert.equal(tokenIdsInZone(final, HUE).has('thi-vc-base'), true);
    assert.equal(tokenIdsInZone(final, QUANG_TRI).has('thi-vc-guerrilla'), true);
    assert.equal(
      (state.zones[AVAILABLE_VC] ?? []).some((token) => String(token.id) === 'thi-vc-guerrilla' && token.props.activity === 'active'),
      true,
    );
    assert.equal(
      (final.zones[QUANG_TRI] ?? []).some((token) => String(token.id) === 'thi-vc-guerrilla' && token.props.activity === 'underground'),
      true,
    );
    assert.equal(final.globalVars.patronage, 1);
  });

  it('shaded becomes partial when fewer ARVN or VC pieces are available', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 87004,
      cardIdInDiscardZone: CARD_ID,
      globalVars: {
        patronage: 73,
      },
      zoneTokens: {
        [LOC_HUE_DA_NANG]: [makeFitlToken('thi-shaded-loc-arvn', 'police', 'ARVN')],
        [AVAILABLE_VC]: [makeFitlToken('thi-only-vc-base', 'base', 'VC')],
      },
    });

    const move = requireEventMove(def, state, CARD_ID, 'shaded');
    const resolved = completeMoveDecisionSequence(def, state, move, {
      choose: (request) => {
        if (matchesDecisionRequest({ name: '$nguyenChanhThiRemovedArvnPieces', resolvedBind: '$nguyenChanhThiRemovedArvnPieces' })(request)) {
          return ['thi-shaded-loc-arvn'];
        }
        if (matchesDecisionRequest({ name: '$nguyenChanhThiVcPieces', resolvedBind: '$nguyenChanhThiVcPieces' })(request)) {
          return ['thi-only-vc-base'];
        }
        if (matchesDecisionRequest({ name: '$nguyenChanhThiVcDestination', resolvedBind: '$nguyenChanhThiVcDestination' })(request)) {
          return HUE;
        }
        if (matchesDecisionRequest({ name: '$nguyenChanhThiPatronageDirection', resolvedBind: '$nguyenChanhThiPatronageDirection' })(request)) {
          return 'increase';
        }
        return undefined;
      },
    });
    assert.equal(resolved.complete, true);
    if (!resolved.complete) {
      throw new Error('Expected partial shaded flow to resolve all decisions.');
    }
    const final = applyMove(def, state, resolved.move).state;

    assert.equal(tokenIdsInZone(final, LOC_HUE_DA_NANG).has('thi-shaded-loc-arvn'), false);
    assert.equal(tokenIdsInZone(final, AVAILABLE_ARVN).has('thi-shaded-loc-arvn'), true);
    assert.equal(tokenIdsInZone(final, HUE).has('thi-only-vc-base'), true);
    assert.equal(tokenIdsInZone(final, AVAILABLE_VC).has('thi-only-vc-base'), false);
    assert.equal(final.globalVars.patronage, 75);
    assert.equal(countTokensInZone(final, LOC_HUE_DA_NANG, (token) => token.props.faction === 'VC'), 0);
  });

  it('shaded VC base destination options exclude LoCs even though ARVN may be removed from them', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 87006,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [LOC_HUE_DA_NANG]: [makeFitlToken('thi-base-target-arvn', 'police', 'ARVN')],
        [AVAILABLE_VC]: [makeFitlToken('thi-base-only-vc', 'base', 'VC')],
      },
    });

    const move = requireEventMove(def, state, CARD_ID, 'shaded');
    const pending = completeMoveDecisionSequence(def, state, move, {
      choose: (request) => {
        if (matchesDecisionRequest({ name: '$nguyenChanhThiRemovedArvnPieces', resolvedBind: '$nguyenChanhThiRemovedArvnPieces' })(request)) {
          return ['thi-base-target-arvn'];
        }
        if (matchesDecisionRequest({ name: '$nguyenChanhThiVcPieces', resolvedBind: '$nguyenChanhThiVcPieces' })(request)) {
          return ['thi-base-only-vc'];
        }
        return undefined;
      },
    });

    assert.equal(pending.complete, false);
    assert.equal(pending.nextDecision?.name, '$nguyenChanhThiVcDestination');
    assert.equal(
      pending.nextDecision?.options.some((option) => String(option.value) === LOC_HUE_DA_NANG),
      false,
    );
    assert.equal(
      pending.nextDecision?.options.some((option) => String(option.value) === LOC_HUE_KHE_SANH),
      false,
    );
    assert.equal(
      pending.nextDecision?.options.some((option) => String(option.value) === HUE),
      true,
    );
  });
});
