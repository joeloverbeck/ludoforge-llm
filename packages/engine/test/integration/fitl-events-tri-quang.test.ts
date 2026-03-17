import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  legalChoicesEvaluate,
  type GameState,
} from '../../src/kernel/index.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import {
  countTokensInZone,
  findTokenInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  requireEventMove,
  runEvent,
  setupFitlEventState,
  tokenIdsInZone,
} from '../helpers/fitl-event-fidelity-helpers.js';
import { withNeutralSupportOppositionMarkers } from '../helpers/isolated-state-helpers.js';

const CARD_ID = 'card-114';
const SAIGON = 'saigon:none';
const HUE = 'hue:none';
const DA_NANG = 'da-nang:none';
const CAN_THO = 'can-tho:none';
const AN_LOC = 'an-loc:none';
const AVAILABLE_VC = 'available-VC:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';

const supportState = (state: GameState, zone: string): string =>
  String(state.markers[zone]?.supportOpposition ?? 'neutral');

const makeVcGuerrilla = (id: string, extra: Record<string, string | number | boolean> = {}) =>
  makeFitlToken(id, 'guerrilla', 'VC', { activity: 'underground', ...extra });

const makeVcBase = (id: string, extra: Record<string, string | number | boolean> = {}) =>
  makeFitlToken(id, 'base', 'VC', { tunnel: 'untunneled', ...extra });

const makeArvnBase = (id: string) =>
  makeFitlToken(id, 'base', 'ARVN', { tunnel: 'untunneled' });

const makeUsBase = (id: string) =>
  makeFitlToken(id, 'base', 'US', { tunnel: 'untunneled' });

const isVcBase = (token: { props?: Record<string, unknown> }): boolean =>
  token.props?.['faction'] === 'VC' && token.props?.['type'] === 'base';

const isVcGuerrilla = (token: { props?: Record<string, unknown> }): boolean =>
  token.props?.['faction'] === 'VC' && token.props?.['type'] === 'guerrilla';

const baseOverride = (tokenId: string) => ({
  when: matchesDecisionRequest({ name: '$triQuangVcBase', resolvedBind: '$triQuangVcBase' }),
  value: [tokenId] as string[],
});

const guerrillaOverride = (tokenId: string) => ({
  when: matchesDecisionRequest({ name: '$triQuangVcGuerrilla', resolvedBind: '$triQuangVcGuerrilla' }),
  value: [tokenId] as string[],
});

const declineBase = () => ({
  when: matchesDecisionRequest({ name: '$triQuangVcBase', resolvedBind: '$triQuangVcBase' }),
  value: [] as string[],
});

/* ------------------------------------------------------------------ */
/*  METADATA                                                           */
/* ------------------------------------------------------------------ */

describe('FITL card-114 Tri Quang — metadata', () => {
  it('compiles with correct metadata', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(card.title, 'Tri Quang');
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1965');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'ARVN', 'US', 'NVA']);
    assert.equal(card.metadata?.flavorText, 'Buddhists counter Communists.');
    assert.equal(card.unshaded?.text, 'Set up to 3 Neutral or Opposition Cities to Passive Support.');
    assert.equal(
      card.shaded?.text,
      'People\'s Revolutionary Committee: Shift Hue, Da Nang, and Saigon 1 level toward Active Opposition. Place a VC piece in Saigon.',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  UNSHADED — Set up to 3 Neutral/Opposition Cities to Passive Supp  */
/* ------------------------------------------------------------------ */

describe('FITL card-114 Tri Quang unshaded', () => {
  it('happy path: sets 3 eligible cities to Passive Support', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114001,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'neutral' },
        [DA_NANG]: { supportOpposition: 'passiveOpposition' },
        [CAN_THO]: { supportOpposition: 'activeOpposition' },
      },
    };

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const targets = [HUE, DA_NANG, CAN_THO];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetCity' }), value: targets },
      ],
    }).state;

    assert.equal(supportState(result, HUE), 'passiveSupport', 'Neutral → Passive Support');
    assert.equal(supportState(result, DA_NANG), 'passiveSupport', 'Passive Opposition → Passive Support');
    assert.equal(supportState(result, CAN_THO), 'passiveSupport', 'Active Opposition → Passive Support');
  });

  it('Neutral city -> Passive Support', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114002,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'neutral' },
      },
    };

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetCity' }), value: [HUE] },
      ],
    }).state;

    assert.equal(supportState(result, HUE), 'passiveSupport');
  });

  it('Passive Opposition -> Passive Support', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114003,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [DA_NANG]: { supportOpposition: 'passiveOpposition' },
      },
    };

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetCity' }), value: [DA_NANG] },
      ],
    }).state;

    assert.equal(supportState(result, DA_NANG), 'passiveSupport');
  });

  it('Active Opposition -> Passive Support (set, not shift)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114004,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [CAN_THO]: { supportOpposition: 'activeOpposition' },
      },
    };

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetCity' }), value: [CAN_THO] },
      ],
    }).state;

    assert.equal(supportState(result, CAN_THO), 'passiveSupport', '3-level jump — set, not shift');
  });

  it('city at Passive Support excluded from choices', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114005,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'passiveSupport' },
        [DA_NANG]: { supportOpposition: 'neutral' },
      },
    };

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    const options = pending.options.map((o) => String(o.value));
    assert.ok(!options.includes(HUE), 'Hue at Passive Support should be excluded');
    assert.ok(options.includes(DA_NANG), 'Da Nang at Neutral should be eligible');
  });

  it('city at Active Support excluded from choices', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114006,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'activeSupport' },
        [DA_NANG]: { supportOpposition: 'neutral' },
      },
    };

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    const options = pending.options.map((o) => String(o.value));
    assert.ok(!options.includes(HUE), 'Hue at Active Support should be excluded');
    assert.ok(options.includes(DA_NANG), 'Da Nang at Neutral should be eligible');
  });

  it('selects 0 cities (min:0)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114007,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'neutral' },
      },
    };

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetCity' }), value: [] },
      ],
    }).state;

    assert.equal(supportState(result, HUE), 'neutral', 'No change when 0 selected');
  });

  it('selects 1 city (fewer than max)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114008,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'neutral' },
        [DA_NANG]: { supportOpposition: 'passiveOpposition' },
      },
    };

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$targetCity' }), value: [HUE] },
      ],
    }).state;

    assert.equal(supportState(result, HUE), 'passiveSupport', 'Selected city changed');
    assert.equal(supportState(result, DA_NANG), 'passiveOpposition', 'Unselected city unchanged');
  });

  it('provinces excluded from choices', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114009,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
      },
    };

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    const options = pending.options.map((o) => String(o.value));
    assert.ok(!options.includes(QUANG_TRI), 'Province should not be a target');
  });
});

/* ------------------------------------------------------------------ */
/*  SHADED — Shift 3 cities + Place VC piece in Saigon                */
/* ------------------------------------------------------------------ */

describe('FITL card-114 Tri Quang shaded', () => {
  it('happy path: shifts 3 cities + places guerrilla from available', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114010,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [makeVcGuerrilla('tq-vc-g'), makeVcBase('tq-vc-b')],
        [SAIGON]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'neutral' },
        [DA_NANG]: { supportOpposition: 'passiveSupport' },
        [SAIGON]: { supportOpposition: 'activeSupport' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [declineBase(), guerrillaOverride('tq-vc-g')],
    });

    // Shifts
    assert.equal(supportState(result.state, HUE), 'passiveOpposition', 'Hue: neutral → passiveOpposition');
    assert.equal(supportState(result.state, DA_NANG), 'neutral', 'Da Nang: passiveSupport → neutral');
    assert.equal(supportState(result.state, SAIGON), 'passiveSupport', 'Saigon: activeSupport → passiveSupport');

    // Guerrilla placed
    assert.equal(countTokensInZone(result.state, SAIGON, isVcGuerrilla), 1, 'VC Guerrilla placed');
    assert.equal(countTokensInZone(result.state, SAIGON, isVcBase), 0, 'No base placed');
  });

  it('shifts clamp at Active Opposition', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114011,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [makeVcGuerrilla('tq-clamp-g')],
        [SAIGON]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'activeOpposition' },
        [DA_NANG]: { supportOpposition: 'neutral' },
        [SAIGON]: { supportOpposition: 'neutral' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [declineBase(), guerrillaOverride('tq-clamp-g')],
    });

    assert.equal(supportState(result.state, HUE), 'activeOpposition', 'Already AO → clamped');
    assert.equal(supportState(result.state, DA_NANG), 'passiveOpposition', 'Neutral → PO');
  });

  it('player chooses base over guerrilla', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114012,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [makeVcBase('tq-base-avail'), makeVcGuerrilla('tq-g-avail')],
        [SAIGON]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [baseOverride('tq-base-avail')],
    });

    assert.equal(countTokensInZone(result.state, SAIGON, isVcBase), 1, 'VC Base placed');
    assert.equal(countTokensInZone(result.state, SAIGON, isVcGuerrilla), 0, 'No guerrilla — base was placed');
  });

  it('stacking blocked: 2 bases in Saigon -> base excluded, guerrilla offered', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114013,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [makeVcBase('tq-blocked-b'), makeVcGuerrilla('tq-blocked-g')],
        [SAIGON]: [makeArvnBase('arvn-b1'), makeUsBase('us-b1')],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    // Base stacking blocks → guerrilla offered instead
    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [guerrillaOverride('tq-blocked-g')],
    });

    assert.equal(countTokensInZone(result.state, SAIGON, isVcBase), 0, 'No VC base (stacking blocked)');
    assert.equal(countTokensInZone(result.state, SAIGON, isVcGuerrilla), 1, 'VC Guerrilla placed instead');
  });

  it('stacking with 1 base: base still eligible', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114014,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [makeVcBase('tq-1base-b'), makeVcGuerrilla('tq-1base-g')],
        [SAIGON]: [makeArvnBase('arvn-b1')],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [baseOverride('tq-1base-b')],
    });

    assert.equal(countTokensInZone(result.state, SAIGON, isVcBase), 1, 'VC Base placed (only 1 base was present)');
    assert.equal(countTokensInZone(result.state, SAIGON, isVcGuerrilla), 0, 'No guerrilla — base was placed');
  });

  it('Rule 1.4.1: base sourced from map when none available', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114015,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [],
        [HUE]: [makeVcBase('tq-map-base')],
        [SAIGON]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [baseOverride('tq-map-base')],
    });

    assert.equal(tokenIdsInZone(result.state, SAIGON).has('tq-map-base'), true, 'Base sourced from map to Saigon');
    assert.equal(tokenIdsInZone(result.state, HUE).has('tq-map-base'), false, 'Base removed from Hue');
  });

  it('tunnel stripped from map-sourced base', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114016,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [],
        [AN_LOC]: [makeVcBase('tq-tunnel-base', { tunnel: 'tunneled' })],
        [SAIGON]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [baseOverride('tq-tunnel-base')],
    });

    assert.equal(tokenIdsInZone(result.state, SAIGON).has('tq-tunnel-base'), true, 'Base placed in Saigon');
    assert.equal(
      findTokenInZone(result.state, SAIGON, 'tq-tunnel-base')?.props.tunnel,
      'untunneled',
      'Tunnel stripped from map-sourced base',
    );
  });

  it('guerrilla sourced from map when none available', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114017,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [],
        [HUE]: [makeVcGuerrilla('tq-map-guerrilla')],
        [SAIGON]: [makeArvnBase('arvn-b1'), makeUsBase('us-b1')], // 2 bases → stacking blocks base
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [guerrillaOverride('tq-map-guerrilla')],
    });

    assert.equal(tokenIdsInZone(result.state, SAIGON).has('tq-map-guerrilla'), true, 'Guerrilla sourced from map');
    assert.equal(tokenIdsInZone(result.state, HUE).has('tq-map-guerrilla'), false, 'Guerrilla removed from Hue');
  });

  it('no VC pieces anywhere: shifts still occur, no piece placed', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114018,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [],
        [SAIGON]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'passiveSupport' },
        [DA_NANG]: { supportOpposition: 'neutral' },
        [SAIGON]: { supportOpposition: 'activeSupport' },
      },
    };

    // No overrides needed — min: 0 picks nothing
    const result = runEvent(def, state, CARD_ID, 'shaded');

    // Shifts still happen
    assert.equal(supportState(result.state, HUE), 'neutral', 'Hue shifted');
    assert.equal(supportState(result.state, DA_NANG), 'passiveOpposition', 'Da Nang shifted');
    assert.equal(supportState(result.state, SAIGON), 'passiveSupport', 'Saigon shifted');

    // No pieces placed
    assert.equal(countTokensInZone(result.state, SAIGON, isVcBase), 0, 'No base');
    assert.equal(countTokensInZone(result.state, SAIGON, isVcGuerrilla), 0, 'No guerrilla');
  });

  it('all 3 city shifts are independent (different starting levels)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 114019,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [],
        [SAIGON]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'activeSupport' },
        [DA_NANG]: { supportOpposition: 'passiveOpposition' },
        [SAIGON]: { supportOpposition: 'neutral' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');

    assert.equal(supportState(result.state, HUE), 'passiveSupport', 'AS → PS (-1)');
    assert.equal(supportState(result.state, DA_NANG), 'activeOpposition', 'PO → AO (-1)');
    assert.equal(supportState(result.state, SAIGON), 'passiveOpposition', 'N → PO (-1)');
  });
});
