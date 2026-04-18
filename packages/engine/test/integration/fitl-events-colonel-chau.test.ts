// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  legalChoicesEvaluate,
  type GameState,
} from '../../src/kernel/index.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import {
  countTokensInZone,
  findTokenInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  requireEventMove,
  setupFitlEventState,
} from '../helpers/fitl-event-fidelity-helpers.js';
import { withNeutralSupportOppositionMarkers } from '../helpers/isolated-state-helpers.js';

const CARD_ID = 'card-112';

// Valid FITL province zone IDs
const QUANG_TRI = 'quang-tri-thua-thien:none';
const BINH_DINH = 'binh-dinh:none';
const PLEIKU_DARLAC = 'pleiku-darlac:none';
const QUANG_NAM = 'quang-nam:none';
const KHANH_HOA = 'khanh-hoa:none';
const TAY_NINH = 'tay-ninh:none';

// City and LoC zone IDs for exclusion tests
const SAIGON = 'saigon:none';
const HUE = 'hue:none';

const AVAILABLE_ARVN = 'available-ARVN:none';
const AVAILABLE_VC = 'available-VC:none';

const supportState = (state: GameState, zone: string): string =>
  String(state.markers[zone]?.supportOpposition ?? 'neutral');

const isArvnPolice = (token: { props: Record<string, unknown> }): boolean =>
  token.props.faction === 'ARVN' && token.props.type === 'police';

const isVcGuerrilla = (token: { props: Record<string, unknown> }): boolean =>
  token.props.faction === 'VC' && token.props.type === 'guerrilla';

describe('FITL card-112 Colonel Chau', () => {
  it('compiles with correct metadata', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(card.title, 'Colonel Chau');
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1964');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'ARVN', 'US', 'NVA']);
    assert.equal(card.metadata?.flavorText, 'Census-grievance teams.');
    assert.equal(card.unshaded?.text, 'Place 1 Police into each of 6 Provinces.');
    assert.equal(
      card.shaded?.text,
      'Local Viet Minh tradition: Shift 3 Provinces with ARVN each 1 level toward Active Opposition. Place a VC Guerrilla in each.',
    );
  });

  // ── Unshaded: Place 1 Police into each of 6 Provinces ──

  it('unshaded happy path: places 1 police in each of 6 selected provinces', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 112001,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [AVAILABLE_ARVN]: [
          makeFitlToken('pol-1', 'police', 'ARVN'),
          makeFitlToken('pol-2', 'police', 'ARVN'),
          makeFitlToken('pol-3', 'police', 'ARVN'),
          makeFitlToken('pol-4', 'police', 'ARVN'),
          makeFitlToken('pol-5', 'police', 'ARVN'),
          makeFitlToken('pol-6', 'police', 'ARVN'),
        ],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const targets = [QUANG_TRI, BINH_DINH, PLEIKU_DARLAC, QUANG_NAM, KHANH_HOA, TAY_NINH];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetProvince' }), value: targets },
      ],
    }).state;

    for (const province of targets) {
      assert.equal(
        countTokensInZone(result, province, isArvnPolice),
        1,
        `Expected 1 police in ${province}`,
      );
    }
    assert.equal(
      countTokensInZone(result, AVAILABLE_ARVN, isArvnPolice),
      0,
      'All 6 police should be placed',
    );
  });

  it('unshaded with fewer than 6 police: places only what is available', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 112002,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [AVAILABLE_ARVN]: [
          makeFitlToken('pol-few-1', 'police', 'ARVN'),
          makeFitlToken('pol-few-2', 'police', 'ARVN'),
          makeFitlToken('pol-few-3', 'police', 'ARVN'),
        ],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const targets = [QUANG_TRI, BINH_DINH, PLEIKU_DARLAC, QUANG_NAM, KHANH_HOA, TAY_NINH];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetProvince' }), value: targets },
      ],
    }).state;

    let totalPlaced = 0;
    for (const province of targets) {
      totalPlaced += countTokensInZone(result, province, isArvnPolice);
    }
    assert.equal(totalPlaced, 3, 'Only 3 police were available to place');
    assert.equal(countTokensInZone(result, AVAILABLE_ARVN, isArvnPolice), 0);
  });

  it('unshaded province-only filter: cities and LoCs excluded from target choices', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 112003,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [AVAILABLE_ARVN]: [makeFitlToken('pol-filter-1', 'police', 'ARVN')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    const options = pending.options.map((o) => String(o.value));
    assert.ok(!options.includes(SAIGON), 'Saigon (city) should not be a target');
    assert.ok(!options.includes(HUE), 'Hue (city) should not be a target');
  });

  it('unshaded with zero police: event runs but no tokens move', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 112004,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [AVAILABLE_ARVN]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetProvince' }), value: [QUANG_TRI] },
      ],
    }).state;

    assert.equal(
      countTokensInZone(result, QUANG_TRI, isArvnPolice),
      0,
      'No police to place when pool is empty',
    );
  });

  // ── Shaded: Shift 3 Provinces with ARVN toward Active Opposition + place underground VC Guerrilla ──

  it('shaded happy path: shifts 3 provinces and places 1 underground VC guerrilla in each', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 112005,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [QUANG_TRI]: { supportOpposition: 'passiveSupport' },
        [BINH_DINH]: { supportOpposition: 'neutral' },
        [PLEIKU_DARLAC]: { supportOpposition: 'activeSupport' },
      },
      zones: {
        ...base.zones,
        [QUANG_TRI]: [makeFitlToken('sh-arvn-qt', 'troops', 'ARVN')],
        [BINH_DINH]: [makeFitlToken('sh-arvn-bd', 'police', 'ARVN')],
        [PLEIKU_DARLAC]: [makeFitlToken('sh-arvn-pd', 'troops', 'ARVN')],
        [AVAILABLE_VC]: [
          makeFitlToken('sh-vc-g1', 'guerrilla', 'VC'),
          makeFitlToken('sh-vc-g2', 'guerrilla', 'VC'),
          makeFitlToken('sh-vc-g3', 'guerrilla', 'VC'),
        ],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const targets = [QUANG_TRI, BINH_DINH, PLEIKU_DARLAC];

    const overrides: DecisionOverrideRule[] = [
      { when: matchesDecisionRequest({ name: '$targetProvince' }), value: targets },
      {
        when: matchesDecisionRequest({ name: '$colonelChauGuerrilla', iterationPath: '[0]' }),
        value: ['sh-vc-g1'],
      },
      {
        when: matchesDecisionRequest({ name: '$colonelChauGuerrilla', iterationPath: '[1]' }),
        value: ['sh-vc-g2'],
      },
      {
        when: matchesDecisionRequest({ name: '$colonelChauGuerrilla', iterationPath: '[2]' }),
        value: ['sh-vc-g3'],
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    // Marker shifts
    assert.equal(supportState(result, QUANG_TRI), 'neutral');
    assert.equal(supportState(result, BINH_DINH), 'passiveOpposition');
    assert.equal(supportState(result, PLEIKU_DARLAC), 'passiveSupport');

    // Guerrilla placement
    for (const province of targets) {
      assert.equal(
        countTokensInZone(result, province, isVcGuerrilla),
        1,
        `Expected 1 VC guerrilla in ${province}`,
      );
    }
    assert.equal(countTokensInZone(result, AVAILABLE_VC, isVcGuerrilla), 0);
  });

  it('shaded guerrilla placed underground', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 112006,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [QUANG_TRI]: { supportOpposition: 'passiveSupport' },
      },
      zones: {
        ...base.zones,
        [QUANG_TRI]: [makeFitlToken('sh-ug-arvn', 'troops', 'ARVN')],
        [AVAILABLE_VC]: [makeFitlToken('sh-ug-vc-g', 'guerrilla', 'VC')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetProvince' }), value: [QUANG_TRI] },
        {
          when: matchesDecisionRequest({ name: '$colonelChauGuerrilla', iterationPath: '[0]' }),
          value: ['sh-ug-vc-g'],
        },
      ],
    }).state;

    const guerrilla = findTokenInZone(result, QUANG_TRI, 'sh-ug-vc-g');
    assert.notEqual(guerrilla, undefined, 'Guerrilla should be placed');
    assert.equal(guerrilla!.props.activity, 'underground', 'Placed guerrilla must be underground');
  });

  it('shaded province must have ARVN presence', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 112007,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [QUANG_TRI]: { supportOpposition: 'passiveSupport' },
        [BINH_DINH]: { supportOpposition: 'passiveSupport' },
      },
      zones: {
        ...base.zones,
        // QUANG_TRI has ARVN, BINH_DINH does not
        [QUANG_TRI]: [makeFitlToken('sh-pres-arvn', 'troops', 'ARVN')],
        [BINH_DINH]: [makeFitlToken('sh-pres-vc', 'guerrilla', 'VC')],
        [AVAILABLE_VC]: [makeFitlToken('sh-pres-vc-g', 'guerrilla', 'VC')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    const options = pending.options.map((o) => String(o.value));
    assert.ok(options.includes(QUANG_TRI), 'Province with ARVN should be eligible');
    assert.ok(!options.includes(BINH_DINH), 'Province without ARVN should NOT be eligible');
  });

  it('shaded province must be shiftable (not already Active Opposition)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 112008,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [QUANG_TRI]: { supportOpposition: 'activeOpposition' },
        [BINH_DINH]: { supportOpposition: 'passiveSupport' },
      },
      zones: {
        ...base.zones,
        [QUANG_TRI]: [makeFitlToken('sh-ao-arvn-qt', 'troops', 'ARVN')],
        [BINH_DINH]: [makeFitlToken('sh-ao-arvn-bd', 'troops', 'ARVN')],
        [AVAILABLE_VC]: [makeFitlToken('sh-ao-vc-g', 'guerrilla', 'VC')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    const options = pending.options.map((o) => String(o.value));
    assert.ok(!options.includes(QUANG_TRI), 'Province at activeOpposition should NOT be eligible');
    assert.ok(options.includes(BINH_DINH), 'Province at passiveSupport with ARVN should be eligible');
  });

  it('shaded province-only filter: cities and LoCs excluded', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 112009,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
      },
      zones: {
        ...base.zones,
        [SAIGON]: [makeFitlToken('sh-city-arvn', 'troops', 'ARVN')],
        [QUANG_TRI]: [makeFitlToken('sh-city-filter-arvn', 'troops', 'ARVN')],
        [AVAILABLE_VC]: [makeFitlToken('sh-city-filter-vc-g', 'guerrilla', 'VC')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    const options = pending.options.map((o) => String(o.value));
    assert.ok(!options.includes(SAIGON), 'Saigon (city) should not be a shaded target');
    assert.ok(!options.includes(HUE), 'Hue (city) should not be a shaded target');
  });

  it('shaded with no VC guerrillas available: shift still occurs, no guerrilla placed', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 112010,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [QUANG_TRI]: { supportOpposition: 'passiveSupport' },
      },
      zones: {
        ...base.zones,
        [QUANG_TRI]: [makeFitlToken('sh-novc-arvn', 'troops', 'ARVN')],
        [AVAILABLE_VC]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetProvince' }), value: [QUANG_TRI] },
      ],
    }).state;

    assert.equal(supportState(result, QUANG_TRI), 'neutral', 'Shift should still occur');
    assert.equal(
      countTokensInZone(result, QUANG_TRI, isVcGuerrilla),
      0,
      'No guerrilla when pool is empty',
    );
  });

  it('shaded with fewer than 3 eligible provinces: selects only what is available', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 112011,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [QUANG_TRI]: { supportOpposition: 'passiveSupport' },
      },
      zones: {
        ...base.zones,
        [QUANG_TRI]: [makeFitlToken('sh-few-arvn', 'troops', 'ARVN')],
        [AVAILABLE_VC]: [makeFitlToken('sh-few-vc-g', 'guerrilla', 'VC')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    assert.equal(pending.max, 1, 'Only 1 eligible province should cap max at 1');

    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetProvince' }), value: [QUANG_TRI] },
        {
          when: matchesDecisionRequest({ name: '$colonelChauGuerrilla', iterationPath: '[0]' }),
          value: ['sh-few-vc-g'],
        },
      ],
    }).state;

    assert.equal(supportState(result, QUANG_TRI), 'neutral');
    assert.equal(countTokensInZone(result, QUANG_TRI, isVcGuerrilla), 1);
  });

  it('shaded pool runs dry mid-event: first provinces get guerrillas, later ones do not', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 112012,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [QUANG_TRI]: { supportOpposition: 'passiveSupport' },
        [BINH_DINH]: { supportOpposition: 'passiveSupport' },
        [PLEIKU_DARLAC]: { supportOpposition: 'passiveSupport' },
      },
      zones: {
        ...base.zones,
        [QUANG_TRI]: [makeFitlToken('sh-dry-arvn-qt', 'troops', 'ARVN')],
        [BINH_DINH]: [makeFitlToken('sh-dry-arvn-bd', 'troops', 'ARVN')],
        [PLEIKU_DARLAC]: [makeFitlToken('sh-dry-arvn-pd', 'troops', 'ARVN')],
        [AVAILABLE_VC]: [
          makeFitlToken('sh-dry-vc-g1', 'guerrilla', 'VC'),
          makeFitlToken('sh-dry-vc-g2', 'guerrilla', 'VC'),
        ],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const targets = [QUANG_TRI, BINH_DINH, PLEIKU_DARLAC];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetProvince' }), value: targets },
        {
          when: matchesDecisionRequest({ name: '$colonelChauGuerrilla', iterationPath: '[0]' }),
          value: ['sh-dry-vc-g1'],
        },
        {
          when: matchesDecisionRequest({ name: '$colonelChauGuerrilla', iterationPath: '[1]' }),
          value: ['sh-dry-vc-g2'],
        },
      ],
    }).state;

    // All 3 provinces should be shifted
    assert.equal(supportState(result, QUANG_TRI), 'neutral');
    assert.equal(supportState(result, BINH_DINH), 'neutral');
    assert.equal(supportState(result, PLEIKU_DARLAC), 'neutral');

    // Only 2 guerrillas were available
    const totalGuerrillas =
      countTokensInZone(result, QUANG_TRI, isVcGuerrilla) +
      countTokensInZone(result, BINH_DINH, isVcGuerrilla) +
      countTokensInZone(result, PLEIKU_DARLAC, isVcGuerrilla);
    assert.equal(totalGuerrillas, 2, 'Only 2 guerrillas available to place across 3 provinces');
    assert.equal(countTokensInZone(result, AVAILABLE_VC, isVcGuerrilla), 0);
  });

  it('shaded pre-existing active VC guerrillas not affected by placement', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 112013,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [QUANG_TRI]: { supportOpposition: 'passiveSupport' },
      },
      zones: {
        ...base.zones,
        [QUANG_TRI]: [
          makeFitlToken('sh-pre-arvn', 'troops', 'ARVN'),
          makeFitlToken('sh-pre-vc-active', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [AVAILABLE_VC]: [makeFitlToken('sh-pre-vc-new', 'guerrilla', 'VC')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetProvince' }), value: [QUANG_TRI] },
        {
          when: matchesDecisionRequest({ name: '$colonelChauGuerrilla', iterationPath: '[0]' }),
          value: ['sh-pre-vc-new'],
        },
      ],
    }).state;

    // Pre-existing active guerrilla should remain active
    const preExisting = findTokenInZone(result, QUANG_TRI, 'sh-pre-vc-active');
    assert.notEqual(preExisting, undefined, 'Pre-existing guerrilla should still be in zone');
    assert.equal(preExisting!.props.activity, 'active', 'Pre-existing guerrilla stays active');

    // New guerrilla should be underground
    const placed = findTokenInZone(result, QUANG_TRI, 'sh-pre-vc-new');
    assert.notEqual(placed, undefined, 'Newly placed guerrilla should be in zone');
    assert.equal(placed!.props.activity, 'underground', 'Newly placed guerrilla must be underground');
  });
});
