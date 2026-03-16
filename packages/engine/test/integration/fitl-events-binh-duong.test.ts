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
  runEvent,
  setupFitlEventState,
} from '../helpers/fitl-event-fidelity-helpers.js';
import { withNeutralSupportOppositionMarkers } from '../helpers/isolated-state-helpers.js';

const CARD_ID = 'card-106';

// 5 provinces adjacent to Saigon
const BINH_TUY_BINH_THUAN = 'binh-tuy-binh-thuan:none';
const QUANG_DUC_LONG_KHANH = 'quang-duc-long-khanh:none';
const TAY_NINH = 'tay-ninh:none';
const KIEN_PHONG = 'kien-phong:none';
const KIEN_HOA_VINH_BINH = 'kien-hoa-vinh-binh:none';

const AVAILABLE_VC = 'available-VC:none';
const AVAILABLE_ARVN = 'available-ARVN:none';

const supportState = (state: GameState, zone: string): string =>
  String(state.markers[zone]?.supportOpposition ?? 'neutral');

const countTokensByType = (
  state: GameState,
  zone: string,
  faction: string,
  type: string,
): number =>
  (state.zones[zone] ?? []).filter(
    (t) => t.props.faction === faction && t.props.type === type,
  ).length;

const stockAvailableVC = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    makeFitlToken(`avail-vc-g-${i}`, 'guerrilla', 'VC'),
  );

const stockAvailablePolice = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    makeFitlToken(`avail-arvn-p-${i}`, 'police', 'ARVN'),
  );

describe('FITL card-106 Binh Duong', () => {
  it('compiles with correct metadata', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(card.title, 'Binh Duong');
    assert.equal(card.sideMode, 'single');
    assert.equal(card.metadata?.period, '1965');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'NVA', 'ARVN', 'US']);
    assert.equal(
      card.unshaded?.text,
      'In each of 2 Provinces adjacent to Saigon, shift Support/Opposition 1 level either direction and place a VC Guerrilla or Police.',
    );
  });

  // ── Test 1: Nominal — both directions available, both token types ──

  it('offers direction and token type choices when both are available', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 106001,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [TAY_NINH]: { supportOpposition: 'neutral' },
        [KIEN_PHONG]: { supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [AVAILABLE_VC]: stockAvailableVC(5),
        [AVAILABLE_ARVN]: stockAvailablePolice(5),
      },
    };

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$targetProvince' }),
          value: [TAY_NINH, KIEN_PHONG],
        },
        {
          when: matchesDecisionRequest({ namePattern: /^\$shiftDir@/ }),
          value: 'toward-support',
        },
        {
          when: matchesDecisionRequest({ namePattern: /^\$pieceType@/ }),
          value: 'vc-guerrilla',
        },
      ],
    });

    // Both provinces shifted toward support
    assert.equal(supportState(result.state, TAY_NINH), 'passiveSupport');
    assert.equal(supportState(result.state, KIEN_PHONG), 'passiveSupport');

    // VC guerrilla placed in each province
    assert.equal(countTokensByType(result.state, TAY_NINH, 'VC', 'guerrilla'), 1);
    assert.equal(countTokensByType(result.state, KIEN_PHONG, 'VC', 'guerrilla'), 1);
  });

  // ── Test 2: Province at activeSupport → forced toward Opposition ──

  it('auto-shifts toward opposition when province is at activeSupport', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 106002,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [TAY_NINH]: { supportOpposition: 'activeSupport' },
      },
      zones: {
        ...base.zones,
        [AVAILABLE_VC]: stockAvailableVC(5),
        [AVAILABLE_ARVN]: stockAvailablePolice(5),
      },
    };

    const result = runEvent(def, setup, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$targetProvince' }),
          value: [TAY_NINH],
        },
        {
          when: matchesDecisionRequest({ namePattern: /^\$pieceType@/ }),
          value: 'vc-guerrilla',
        },
      ],
    });

    // Forced shift: activeSupport → passiveSupport (no direction chooseOne)
    assert.equal(supportState(result.state, TAY_NINH), 'passiveSupport');
  });

  // ── Test 3: Province at activeOpposition → forced toward Support ──

  it('auto-shifts toward support when province is at activeOpposition', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 106003,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [KIEN_PHONG]: { supportOpposition: 'activeOpposition' },
      },
      zones: {
        ...base.zones,
        [AVAILABLE_VC]: stockAvailableVC(5),
        [AVAILABLE_ARVN]: stockAvailablePolice(5),
      },
    };

    const result = runEvent(def, setup, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$targetProvince' }),
          value: [KIEN_PHONG],
        },
        {
          when: matchesDecisionRequest({ namePattern: /^\$pieceType@/ }),
          value: 'police',
        },
      ],
    });

    // Forced shift: activeOpposition → passiveOpposition (no direction chooseOne)
    assert.equal(supportState(result.state, KIEN_PHONG), 'passiveOpposition');
  });

  // ── Test 4: Playbook unusual move — Opposition + Police ──

  it('allows shifting toward opposition and placing Police (playbook unusual move)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 106004,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [TAY_NINH]: { supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [AVAILABLE_VC]: stockAvailableVC(5),
        [AVAILABLE_ARVN]: stockAvailablePolice(5),
      },
    };

    const result = runEvent(def, setup, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$targetProvince' }),
          value: [TAY_NINH],
        },
        {
          when: matchesDecisionRequest({ namePattern: /^\$shiftDir@/ }),
          value: 'toward-opposition',
        },
        {
          when: matchesDecisionRequest({ namePattern: /^\$pieceType@/ }),
          value: 'police',
        },
      ],
    });

    assert.equal(supportState(result.state, TAY_NINH), 'passiveOpposition');
    assert.equal(countTokensByType(result.state, TAY_NINH, 'ARVN', 'police'), 1);
  });

  // ── Test 5: Only VC guerrillas available ──

  it('auto-places VC guerrilla when no Police available', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 106005,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [TAY_NINH]: { supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [AVAILABLE_VC]: stockAvailableVC(5),
        [AVAILABLE_ARVN]: [], // no Police
      },
    };

    const result = runEvent(def, setup, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$targetProvince' }),
          value: [TAY_NINH],
        },
        {
          when: matchesDecisionRequest({ namePattern: /^\$shiftDir@/ }),
          value: 'toward-support',
        },
      ],
    });

    // No pieceType chooseOne — auto-places VC guerrilla
    assert.equal(countTokensByType(result.state, TAY_NINH, 'VC', 'guerrilla'), 1);
    assert.equal(countTokensByType(result.state, TAY_NINH, 'ARVN', 'police'), 0);
  });

  // ── Test 6: Only Police available ──

  it('auto-places Police when no VC guerrillas available', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 106006,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [KIEN_PHONG]: { supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [AVAILABLE_VC]: [], // no VC guerrillas
        [AVAILABLE_ARVN]: stockAvailablePolice(5),
      },
    };

    const result = runEvent(def, setup, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$targetProvince' }),
          value: [KIEN_PHONG],
        },
        {
          when: matchesDecisionRequest({ namePattern: /^\$shiftDir@/ }),
          value: 'toward-support',
        },
      ],
    });

    // No pieceType chooseOne — auto-places Police
    assert.equal(countTokensByType(result.state, KIEN_PHONG, 'ARVN', 'police'), 1);
    assert.equal(countTokensByType(result.state, KIEN_PHONG, 'VC', 'guerrilla'), 0);
  });

  // ── Test 7: All 5 adjacent provinces eligible ──

  it('target selector returns exactly the 5 Saigon-adjacent provinces', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 106007,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
      },
      zones: {
        ...base.zones,
        [AVAILABLE_VC]: stockAvailableVC(5),
        [AVAILABLE_ARVN]: stockAvailablePolice(5),
      },
    };

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    assert.equal(pending.max, 2);

    const options = new Set(pending.options.map((o) => String(o.value)));
    const expected = new Set([
      BINH_TUY_BINH_THUAN,
      QUANG_DUC_LONG_KHANH,
      TAY_NINH,
      KIEN_PHONG,
      KIEN_HOA_VINH_BINH,
    ]);
    assert.deepEqual(options, expected);
  });

  // ── Test 8: Scoped binding isolation — different choices per province ──

  it('supports independent shift direction and token type per province via scoped bindings', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 106008,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [TAY_NINH]: { supportOpposition: 'passiveOpposition' },
        [KIEN_PHONG]: { supportOpposition: 'passiveSupport' },
      },
      zones: {
        ...base.zones,
        [AVAILABLE_VC]: stockAvailableVC(5),
        [AVAILABLE_ARVN]: stockAvailablePolice(5),
      },
    };

    // Province A: toward-support + vc-guerrilla; Province B: toward-opposition + police
    const result = applyMoveWithResolvedDecisionIds(
      def,
      setup,
      requireEventMove(def, setup, CARD_ID, 'unshaded'),
      {
        overrides: [
          {
            when: matchesDecisionRequest({ name: '$targetProvince' }),
            value: [TAY_NINH, KIEN_PHONG],
          },
          {
            when: matchesDecisionRequest({
              namePattern: /^\$shiftDir@/,
              resolvedBindPattern: /tay-ninh/,
            }),
            value: 'toward-support',
          },
          {
            when: matchesDecisionRequest({
              namePattern: /^\$shiftDir@/,
              resolvedBindPattern: /kien-phong/,
            }),
            value: 'toward-opposition',
          },
          {
            when: matchesDecisionRequest({
              namePattern: /^\$pieceType@/,
              resolvedBindPattern: /tay-ninh/,
            }),
            value: 'vc-guerrilla',
          },
          {
            when: matchesDecisionRequest({
              namePattern: /^\$pieceType@/,
              resolvedBindPattern: /kien-phong/,
            }),
            value: 'police',
          },
        ],
      },
    );

    // Tay Ninh: passiveOpposition +1 → neutral, VC guerrilla placed
    assert.equal(supportState(result.state, TAY_NINH), 'neutral');
    assert.equal(countTokensByType(result.state, TAY_NINH, 'VC', 'guerrilla'), 1);

    // Kien Phong: passiveSupport -1 → neutral, Police placed
    assert.equal(supportState(result.state, KIEN_PHONG), 'neutral');
    assert.equal(countTokensByType(result.state, KIEN_PHONG, 'ARVN', 'police'), 1);
  });

  // ── Test 9: Mixed — one province forced, other has choice ──

  it('handles mixed forced and choice provinces correctly', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 106009,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [TAY_NINH]: { supportOpposition: 'activeSupport' }, // forced toward opposition
        [KIEN_PHONG]: { supportOpposition: 'neutral' }, // choice available
      },
      zones: {
        ...base.zones,
        [AVAILABLE_VC]: stockAvailableVC(5),
        [AVAILABLE_ARVN]: stockAvailablePolice(5),
      },
    };

    const result = applyMoveWithResolvedDecisionIds(
      def,
      setup,
      requireEventMove(def, setup, CARD_ID, 'unshaded'),
      {
        overrides: [
          {
            when: matchesDecisionRequest({ name: '$targetProvince' }),
            value: [TAY_NINH, KIEN_PHONG],
          },
          {
            // Only Kien Phong should get this choice — Tay Ninh is forced
            when: matchesDecisionRequest({ namePattern: /^\$shiftDir@/ }),
            value: 'toward-support',
          },
          {
            when: matchesDecisionRequest({ namePattern: /^\$pieceType@/ }),
            value: 'vc-guerrilla',
          },
        ],
      },
    );

    // Tay Ninh: activeSupport → passiveSupport (forced, no direction choice)
    assert.equal(supportState(result.state, TAY_NINH), 'passiveSupport');
    // Kien Phong: neutral → passiveSupport (chose toward-support)
    assert.equal(supportState(result.state, KIEN_PHONG), 'passiveSupport');

    // Both got a VC guerrilla
    assert.equal(countTokensByType(result.state, TAY_NINH, 'VC', 'guerrilla'), 1);
    assert.equal(countTokensByType(result.state, KIEN_PHONG, 'VC', 'guerrilla'), 1);
  });
});
