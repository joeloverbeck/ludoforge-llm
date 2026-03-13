import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  legalChoicesEvaluate,
  type GameState,
} from '../../src/kernel/index.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import {
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  requireEventMove,
  setupFitlEventState,
} from '../helpers/fitl-event-fidelity-helpers.js';
import { withNeutralSupportOppositionMarkers } from '../helpers/isolated-state-helpers.js';

const CARD_ID = 'card-85';
const HUE = 'hue:none';
const QUANG_NAM = 'quang-nam:none';
const DA_NANG = 'da-nang:none';
const SAIGON = 'saigon:none';
const CAN_THO = 'can-tho:none';
const CENTRAL_LAOS = 'central-laos:none';
const LOC_HUE_DA_NANG = 'loc-hue-da-nang:none';

const supportState = (state: GameState, zone: string): string =>
  String(state.markers[zone]?.supportOpposition ?? 'neutral');

describe('FITL card-85 USAID', () => {
  it('compiles the exact rules text, seat order, and declarative selectors for both sides', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(card.title, 'USAID');
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1965');
    assert.deepEqual(card.metadata?.seatOrder, ['ARVN', 'VC', 'US', 'NVA']);
    assert.equal(card.metadata?.flavorText, 'Development spending competes with local capture.');
    assert.equal(card.unshaded?.text, 'Shift 3 COIN-Controlled spaces each 1 level toward Active Support.');
    assert.equal(card.shaded?.text, 'Increase or decrease any or all of ARVN Resources, Aid, and Patronage by 2 each.');

    const unshadedJson = JSON.stringify(card.unshaded?.effects ?? []);
    const shadedJson = JSON.stringify(card.shaded?.effects ?? []);
    assert.match(unshadedJson, /"bind":"\$usaidCoinControlledSpaces"/);
    assert.match(unshadedJson, /"value":\["US","ARVN"\]/);
    assert.match(unshadedJson, /"value":\["NVA","VC"\]/);
    assert.match(unshadedJson, /"marker":"supportOpposition"/);
    assert.match(unshadedJson, /"op":"markerShiftAllowed".*"delta":1/);
    assert.doesNotMatch(unshadedJson, /"op":"markerStateAllowed".*"state":"activeSupport"/);
    assert.match(unshadedJson, /"left":3/);
    assert.match(unshadedJson, /"shiftMarker".*"delta":1/);

    assert.match(shadedJson, /"bind":"\$usaidTracks"/);
    assert.match(shadedJson, /"values":\["arvnResources","aid","patronage"\]/);
    assert.match(shadedJson, /"bind":"\$usaidDirection@\{\$usaidTrack\}"/);
    assert.match(shadedJson, /"var":"arvnResources".*"delta":2/);
    assert.match(shadedJson, /"var":"arvnResources".*"delta":-2/);
    assert.match(shadedJson, /"var":"aid".*"delta":2/);
    assert.match(shadedJson, /"var":"aid".*"delta":-2/);
    assert.match(shadedJson, /"var":"patronage".*"delta":2/);
    assert.match(shadedJson, /"var":"patronage".*"delta":-2/);
  });

  it('unshaded requires exactly 3 eligible COIN-controlled spaces when available and excludes LoCs, Pop-0 provinces, non-COIN control, and maxed support', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 85001,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'neutral' },
        [QUANG_NAM]: { supportOpposition: 'passiveOpposition' },
        [DA_NANG]: { supportOpposition: 'passiveSupport' },
        [SAIGON]: { supportOpposition: 'activeSupport' },
        [CAN_THO]: { supportOpposition: 'neutral' },
        [CENTRAL_LAOS]: { supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [HUE]: [makeFitlToken('usaid-us-hue', 'troops', 'US')],
        [QUANG_NAM]: [makeFitlToken('usaid-arvn-qn', 'police', 'ARVN')],
        [DA_NANG]: [
          makeFitlToken('usaid-us-dn', 'troops', 'US'),
          makeFitlToken('usaid-arvn-dn', 'police', 'ARVN'),
          makeFitlToken('usaid-vc-dn', 'guerrilla', 'VC'),
        ],
        [SAIGON]: [makeFitlToken('usaid-arvn-sg', 'police', 'ARVN')],
        [CAN_THO]: [
          makeFitlToken('usaid-vc-ct-1', 'guerrilla', 'VC'),
          makeFitlToken('usaid-vc-ct-2', 'guerrilla', 'VC'),
        ],
        [CENTRAL_LAOS]: [makeFitlToken('usaid-us-laos', 'troops', 'US')],
        [LOC_HUE_DA_NANG]: [makeFitlToken('usaid-us-loc', 'troops', 'US')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending USAID unshaded support-space selector.');
    }

    assert.equal(pending.min, 3);
    assert.equal(pending.max, 3);
    assert.deepEqual(pending.options.map((option) => String(option.value)).sort(), [DA_NANG, HUE, QUANG_NAM]);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$usaidCoinControlledSpaces' }),
          value: [HUE, QUANG_NAM, DA_NANG],
        },
      ],
    }).state;

    assert.equal(supportState(final, HUE), 'passiveSupport');
    assert.equal(supportState(final, QUANG_NAM), 'neutral');
    assert.equal(supportState(final, DA_NANG), 'activeSupport');
    assert.equal(supportState(final, SAIGON), 'activeSupport');
    assert.equal(supportState(final, CAN_THO), 'neutral');
    assert.equal(supportState(final, CENTRAL_LAOS), 'neutral');
    assert.equal(supportState(final, LOC_HUE_DA_NANG), 'neutral');
  });

  it('unshaded scales the exact selection count down when fewer than 3 eligible spaces exist and becomes a legal no-op when none exist', () => {
    const def = getFitlEventDef();

    const twoEligibleBase = setupFitlEventState(def, {
      seed: 85002,
      cardIdInDiscardZone: CARD_ID,
      markers: {
        ...withNeutralSupportOppositionMarkers(setupFitlEventState(def, { seed: 85002, cardIdInDiscardZone: CARD_ID })),
        [HUE]: { supportOpposition: 'neutral' },
        [QUANG_NAM]: { supportOpposition: 'passiveSupport' },
        [SAIGON]: { supportOpposition: 'activeSupport' },
      },
      zoneTokens: {
        [HUE]: [makeFitlToken('usaid-two-us-hue', 'troops', 'US')],
        [QUANG_NAM]: [makeFitlToken('usaid-two-arvn-qn', 'police', 'ARVN')],
        [SAIGON]: [makeFitlToken('usaid-two-arvn-sg', 'police', 'ARVN')],
      },
    });
    const twoEligibleMove = requireEventMove(def, twoEligibleBase, CARD_ID, 'unshaded');
    const twoEligiblePending = legalChoicesEvaluate(def, twoEligibleBase, twoEligibleMove);
    assert.equal(twoEligiblePending.kind, 'pending');
    if (twoEligiblePending.kind !== 'pending') {
      throw new Error('Expected reduced-cardinality USAID selector.');
    }
    assert.equal(twoEligiblePending.min, 2);
    assert.equal(twoEligiblePending.max, 2);
    assert.deepEqual(twoEligiblePending.options.map((option) => String(option.value)).sort(), [HUE, QUANG_NAM]);

    const twoEligibleFinal = applyMoveWithResolvedDecisionIds(def, twoEligibleBase, twoEligibleMove, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$usaidCoinControlledSpaces' }),
          value: [HUE, QUANG_NAM],
        },
      ],
    }).state;
    assert.equal(supportState(twoEligibleFinal, HUE), 'passiveSupport');
    assert.equal(supportState(twoEligibleFinal, QUANG_NAM), 'activeSupport');
    assert.equal(supportState(twoEligibleFinal, SAIGON), 'activeSupport');

    const noneEligibleBase = setupFitlEventState(def, {
      seed: 85003,
      cardIdInDiscardZone: CARD_ID,
      markers: {
        ...withNeutralSupportOppositionMarkers(setupFitlEventState(def, { seed: 85003, cardIdInDiscardZone: CARD_ID })),
        [SAIGON]: { supportOpposition: 'activeSupport' },
        [CAN_THO]: { supportOpposition: 'neutral' },
      },
      zoneTokens: {
        [SAIGON]: [makeFitlToken('usaid-none-arvn-sg', 'police', 'ARVN')],
        [CAN_THO]: [
          makeFitlToken('usaid-none-vc-1', 'guerrilla', 'VC'),
          makeFitlToken('usaid-none-vc-2', 'guerrilla', 'VC'),
        ],
      },
      globalVars: {
        aid: 21,
        arvnResources: 17,
        patronage: 9,
      },
    });
    const noneEligibleMove = requireEventMove(def, noneEligibleBase, CARD_ID, 'unshaded');
    const noneEligiblePending = legalChoicesEvaluate(def, noneEligibleBase, noneEligibleMove);
    assert.equal(noneEligiblePending.kind, 'pending');
    if (noneEligiblePending.kind !== 'pending') {
      throw new Error('Expected zero-cardinality USAID selector.');
    }
    assert.equal(noneEligiblePending.min, 0);
    assert.equal(noneEligiblePending.max, 0);
    assert.deepEqual(noneEligiblePending.options, []);

    const noneEligibleFinal = applyMoveWithResolvedDecisionIds(def, noneEligibleBase, noneEligibleMove).state;
    assert.equal(supportState(noneEligibleFinal, SAIGON), 'activeSupport');
    assert.equal(supportState(noneEligibleFinal, CAN_THO), 'neutral');
    assert.equal(noneEligibleFinal.globalVars.aid, 21);
    assert.equal(noneEligibleFinal.globalVars.arvnResources, 17);
    assert.equal(noneEligibleFinal.globalVars.patronage, 9);
  });

  it('shaded allows selecting any non-empty subset of tracks and mixing increase/decrease directions independently', () => {
    const def = getFitlEventDef();
    const setup = setupFitlEventState(def, {
      seed: 85004,
      cardIdInDiscardZone: CARD_ID,
      globalVars: {
        arvnResources: 74,
        aid: 1,
        patronage: 73,
      },
    });

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending shaded USAID track selector.');
    }

    assert.equal(pending.min, 1);
    assert.equal(pending.max, 3);
    assert.deepEqual(pending.options.map((option) => String(option.value)).sort(), ['aid', 'arvnResources', 'patronage']);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$usaidTracks' }),
          value: ['arvnResources', 'aid', 'patronage'],
        },
        {
          when: matchesDecisionRequest({ name: '$usaidDirection@arvnResources' }),
          value: 'increase',
        },
        {
          when: matchesDecisionRequest({ name: '$usaidDirection@aid' }),
          value: 'decrease',
        },
        {
          when: matchesDecisionRequest({ name: '$usaidDirection@patronage' }),
          value: 'increase',
        },
      ],
    }).state;

    assert.equal(final.globalVars.arvnResources, 75, 'ARVN Resources should increase by 2 and clamp at 75');
    assert.equal(final.globalVars.aid, 0, 'Aid should decrease by 2 and clamp at 0');
    assert.equal(final.globalVars.patronage, 75, 'Patronage should increase by 2 and clamp at 75');
  });

  it('shaded can adjust only a single selected track while leaving the others unchanged', () => {
    const def = getFitlEventDef();
    const setup = setupFitlEventState(def, {
      seed: 85005,
      cardIdInDiscardZone: CARD_ID,
      globalVars: {
        arvnResources: 6,
        aid: 20,
        patronage: 4,
      },
    });

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const final = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$usaidTracks' }),
          value: ['patronage'],
        },
        {
          when: matchesDecisionRequest({ name: '$usaidDirection@patronage' }),
          value: 'decrease',
        },
      ],
    }).state;

    assert.equal(final.globalVars.arvnResources, 6);
    assert.equal(final.globalVars.aid, 20);
    assert.equal(final.globalVars.patronage, 2);
  });
});
