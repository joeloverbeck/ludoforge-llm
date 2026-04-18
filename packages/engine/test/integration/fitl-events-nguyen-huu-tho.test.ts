// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type GameState } from '../../src/kernel/index.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import {
  countTokensInZone,
  findTokenInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
  tokenIdsInZone,
} from '../helpers/fitl-event-fidelity-helpers.js';
import { withNeutralSupportOppositionMarkers } from '../helpers/isolated-state-helpers.js';

const CARD_ID = 'card-109';
const SAIGON = 'saigon:none';
const AVAILABLE_VC = 'available-VC:none';
const HUE = 'hue:none';
const DA_NANG = 'da-nang:none';
const QUI_NHON = 'qui-nhon:none';
const AN_LOC = 'an-loc:none';

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
  when: matchesDecisionRequest({ name: '$nguyenHuuThoVcBase', resolvedBind: '$nguyenHuuThoVcBase' }),
  value: [tokenId] as string[],
});

const guerrillaOverride = (tokenId: string) => ({
  when: matchesDecisionRequest({ name: '$nguyenHuuThoVcGuerrilla', resolvedBind: '$nguyenHuuThoVcGuerrilla' }),
  value: [tokenId] as string[],
});

/* ------------------------------------------------------------------ */
/*  METADATA                                                           */
/* ------------------------------------------------------------------ */

describe('FITL card-109 Nguyen Huu Tho — metadata', () => {
  it('compiles with correct metadata', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(card.title, 'Nguyen Huu Tho');
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1965');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'NVA', 'ARVN', 'US']);
    assert.equal(
      card.unshaded?.text,
      'Shift each City with VC 1 level toward Active Support.',
    );
    assert.equal(
      card.shaded?.text,
      'National Liberation Front leader: Place a VC base and a VC Guerrilla in Saigon. Stay Eligible.',
    );
  });

  it('shaded side has remain-eligible eligibility override', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    const overrides = card.shaded?.eligibilityOverrides ?? [];
    assert.ok(overrides.length > 0, 'Should have eligibility overrides');
    const first = overrides[0];
    assert.ok(first !== undefined, 'First override should exist');
    assert.equal(first.windowId, 'remain-eligible');
  });
});

/* ------------------------------------------------------------------ */
/*  UNSHADED — Shift each City with VC 1 level toward Active Support  */
/* ------------------------------------------------------------------ */

describe('FITL card-109 Nguyen Huu Tho unshaded — happy path', () => {
  it('shifts multiple cities with VC toward Active Support', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109001,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [HUE]: [makeVcGuerrilla('vc-g-hue')],
        [DA_NANG]: [makeVcBase('vc-b-danang')],
        [QUI_NHON]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'neutral' },
        [DA_NANG]: { supportOpposition: 'passiveOpposition' },
        [QUI_NHON]: { supportOpposition: 'neutral' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(supportState(result.state, HUE), 'passiveSupport', 'Hue: neutral → passiveSupport');
    assert.equal(supportState(result.state, DA_NANG), 'neutral', 'Da Nang: passiveOpposition → neutral');
    assert.equal(supportState(result.state, QUI_NHON), 'neutral', 'Qui Nhon: no VC → unchanged');
  });
});

describe('FITL card-109 Nguyen Huu Tho unshaded — already at Active Support', () => {
  it('no change when city with VC already at Active Support', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109002,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [HUE]: [makeVcGuerrilla('vc-g-hue')],
      },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'activeSupport' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(supportState(result.state, HUE), 'activeSupport', 'Already at Active Support → clamped');
  });
});

describe('FITL card-109 Nguyen Huu Tho unshaded — shift levels', () => {
  it('city at Passive Opposition → Neutral', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109003,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [HUE]: [makeVcGuerrilla('vc-g-hue')],
      },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'passiveOpposition' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(supportState(result.state, HUE), 'neutral');
  });

  it('city at Active Opposition → Passive Opposition', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109004,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [HUE]: [makeVcGuerrilla('vc-g-hue')],
      },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'activeOpposition' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(supportState(result.state, HUE), 'passiveOpposition');
  });

  it('city at Neutral → Passive Support', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109005,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [HUE]: [makeVcGuerrilla('vc-g-hue')],
      },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'neutral' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(supportState(result.state, HUE), 'passiveSupport');
  });

  it('city at Passive Support → Active Support', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109006,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [HUE]: [makeVcGuerrilla('vc-g-hue')],
      },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'passiveSupport' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(supportState(result.state, HUE), 'activeSupport');
  });
});

describe('FITL card-109 Nguyen Huu Tho unshaded — no VC in any city', () => {
  it('no shifts when no VC pieces in any city', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109007,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [HUE]: [],
        [DA_NANG]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'passiveOpposition' },
        [DA_NANG]: { supportOpposition: 'passiveOpposition' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(supportState(result.state, HUE), 'passiveOpposition', 'Hue unchanged');
    assert.equal(supportState(result.state, DA_NANG), 'passiveOpposition', 'Da Nang unchanged');
  });
});

describe('FITL card-109 Nguyen Huu Tho unshaded — VC in provinces only', () => {
  it('no shifts when VC only in provinces (not cities)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109008,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'quang-tri-thua-thien:none': [makeVcGuerrilla('vc-g-province')],
        [HUE]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'neutral' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(supportState(result.state, HUE), 'neutral', 'Hue unchanged — VC only in province');
  });
});

describe('FITL card-109 Nguyen Huu Tho unshaded — all VC types qualify', () => {
  it('VC base alone qualifies a city for shift', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109009,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [HUE]: [makeVcBase('vc-b-hue')],
      },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [HUE]: { supportOpposition: 'neutral' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(supportState(result.state, HUE), 'passiveSupport', 'VC base qualifies city');
  });
});

/* ------------------------------------------------------------------ */
/*  SHADED — Place VC Base + VC Guerrilla in Saigon. Stay Eligible.   */
/* ------------------------------------------------------------------ */

describe('FITL card-109 Nguyen Huu Tho shaded — happy path (available)', () => {
  it('places VC Base and VC Guerrilla from available into Saigon', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109020,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [makeVcBase('vc-b-avail'), makeVcGuerrilla('vc-g-avail')],
        [SAIGON]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [baseOverride('vc-b-avail'), guerrillaOverride('vc-g-avail')],
    });
    assert.equal(countTokensInZone(result.state, SAIGON, isVcBase), 1, 'VC Base placed in Saigon');
    assert.equal(countTokensInZone(result.state, SAIGON, isVcGuerrilla), 1, 'VC Guerrilla placed in Saigon');
    assert.equal(
      findTokenInZone(result.state, SAIGON, 'vc-g-avail')?.props.activity,
      'underground',
      'Guerrilla placed underground',
    );
  });
});

describe('FITL card-109 Nguyen Huu Tho shaded — base stacking blocked', () => {
  it('skips base placement when 2 bases already in Saigon', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109021,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [makeVcBase('vc-b-avail'), makeVcGuerrilla('vc-g-avail')],
        [SAIGON]: [makeArvnBase('arvn-b1'), makeUsBase('us-b1')],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    // Base stacking blocks → no base override needed. Guerrilla still placed.
    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [guerrillaOverride('vc-g-avail')],
    });
    assert.equal(countTokensInZone(result.state, SAIGON, isVcBase), 0, 'No VC base placed (2 bases already present)');
    assert.equal(countTokensInZone(result.state, SAIGON, isVcGuerrilla), 1, 'VC Guerrilla still placed');
  });

  it('2 bases of different factions blocks VC base', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109022,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [makeVcBase('vc-b-avail'), makeVcGuerrilla('vc-g-avail')],
        [SAIGON]: [makeVcBase('vc-b-existing'), makeArvnBase('arvn-b1')],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [guerrillaOverride('vc-g-avail')],
    });
    assert.equal(countTokensInZone(result.state, SAIGON, isVcBase), 1, 'Still only original VC base (placement blocked)');
    assert.equal(countTokensInZone(result.state, SAIGON, isVcGuerrilla), 1, 'VC Guerrilla still placed');
  });
});

describe('FITL card-109 Nguyen Huu Tho shaded — mixed stacking (1 base)', () => {
  it('places VC base when only 1 base in Saigon (< 2)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109023,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [makeVcBase('vc-b-avail'), makeVcGuerrilla('vc-g-avail')],
        [SAIGON]: [makeArvnBase('arvn-b1')],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [baseOverride('vc-b-avail'), guerrillaOverride('vc-g-avail')],
    });
    assert.equal(countTokensInZone(result.state, SAIGON, isVcBase), 1, 'VC Base placed (only 1 base was present)');
    assert.equal(countTokensInZone(result.state, SAIGON, isVcGuerrilla), 1, 'VC Guerrilla placed');
  });
});

describe('FITL card-109 Nguyen Huu Tho shaded — base from map (Rule 1.4.1)', () => {
  it('sources VC base from map when none available', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109024,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [makeVcGuerrilla('vc-g-avail')],
        [HUE]: [makeVcBase('vc-b-hue')],
        [SAIGON]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [baseOverride('vc-b-hue'), guerrillaOverride('vc-g-avail')],
    });
    assert.equal(tokenIdsInZone(result.state, SAIGON).has('vc-b-hue'), true, 'VC Base sourced from map to Saigon');
    assert.equal(tokenIdsInZone(result.state, HUE).has('vc-b-hue'), false, 'VC Base removed from Hue');
    assert.equal(countTokensInZone(result.state, SAIGON, isVcGuerrilla), 1, 'VC Guerrilla placed');
  });
});

describe('FITL card-109 Nguyen Huu Tho shaded — tunnel stripped', () => {
  it('strips tunnel marker when base sourced from map had tunnel', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109025,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [makeVcGuerrilla('vc-g-avail')],
        [AN_LOC]: [makeVcBase('vc-b-anloc', { tunnel: 'tunneled' })],
        [SAIGON]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [baseOverride('vc-b-anloc'), guerrillaOverride('vc-g-avail')],
    });
    assert.equal(tokenIdsInZone(result.state, SAIGON).has('vc-b-anloc'), true, 'VC Base placed in Saigon');
    assert.equal(
      findTokenInZone(result.state, SAIGON, 'vc-b-anloc')?.props.tunnel,
      'untunneled',
      'Tunnel marker stripped',
    );
  });
});

describe('FITL card-109 Nguyen Huu Tho shaded — guerrilla from map', () => {
  it('sources guerrilla from map when none in available', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109026,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [makeVcBase('vc-b-avail')],
        [HUE]: [makeVcGuerrilla('vc-g-hue')],
        [SAIGON]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [baseOverride('vc-b-avail'), guerrillaOverride('vc-g-hue')],
    });
    assert.equal(tokenIdsInZone(result.state, SAIGON).has('vc-g-hue'), true, 'VC Guerrilla sourced from map');
    assert.equal(tokenIdsInZone(result.state, HUE).has('vc-g-hue'), false, 'VC Guerrilla removed from Hue');
    assert.equal(
      findTokenInZone(result.state, SAIGON, 'vc-g-hue')?.props.activity,
      'underground',
      'Guerrilla placed underground',
    );
  });
});

describe('FITL card-109 Nguyen Huu Tho shaded — no VC pieces anywhere', () => {
  it('no placement when no VC base or guerrilla anywhere', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 109027,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [AVAILABLE_VC]: [],
        [SAIGON]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    // No overrides needed — min: 0 picks nothing when nothing available
    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(countTokensInZone(result.state, SAIGON, isVcBase), 0, 'No VC base placed');
    assert.equal(countTokensInZone(result.state, SAIGON, isVcGuerrilla), 0, 'No VC guerrilla placed');
  });
});
