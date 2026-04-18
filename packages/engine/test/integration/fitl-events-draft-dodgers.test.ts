// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type GameState } from '../../src/kernel/index.js';
import {
  countTokensInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
} from '../helpers/fitl-event-fidelity-helpers.js';
import { withNeutralSupportOppositionMarkers } from '../helpers/isolated-state-helpers.js';

const CARD_ID = 'card-108';
const CASUALTIES = 'casualties-US:none';
const OUT_OF_PLAY = 'out-of-play-US:none';
const AVAILABLE = 'available-US:none';

const isTroop = (token: { props?: Record<string, unknown> }): boolean =>
  token.props?.['faction'] === 'US' && token.props?.['type'] === 'troops';

const makeUsTroop = (id: string) => makeFitlToken(id, 'troops', 'US');
const makeUsBase = (id: string) => makeFitlToken(id, 'base', 'US');

describe('FITL card-108 Draft Dodgers — metadata', () => {
  it('compiles with correct metadata', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(card.title, 'Draft Dodgers');
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1965');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'NVA', 'ARVN', 'US']);
    assert.equal(
      card.unshaded?.text,
      'If fewer than 3 Casualty pieces, 3 US Troops from out of play to Available.',
    );
    assert.equal(
      card.shaded?.text,
      'Recruiting sags: Move 1 US Troop per Casualty piece, to a maximum of 3, from Available to out-of-play.',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  UNSHADED — condition true (fewer than 3 casualties)               */
/* ------------------------------------------------------------------ */

describe('FITL card-108 Draft Dodgers unshaded — condition true', () => {
  it('moves 3 troops from OOP to available when 0 casualties', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108001,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [],
        [OUT_OF_PLAY]: [makeUsTroop('oop-t1'), makeUsTroop('oop-t2'), makeUsTroop('oop-t3'), makeUsTroop('oop-t4')],
        [AVAILABLE]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(
      countTokensInZone(result.state, AVAILABLE, isTroop),
      3,
      'Should move 3 troops to available',
    );
    assert.equal(
      countTokensInZone(result.state, OUT_OF_PLAY, isTroop),
      1,
      'Should have 1 troop remaining in OOP',
    );
  });

  it('moves 3 troops when 1 casualty is a base (bases count as pieces)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108002,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [makeUsBase('cas-b1')],
        [OUT_OF_PLAY]: [makeUsTroop('oop-t1'), makeUsTroop('oop-t2'), makeUsTroop('oop-t3')],
        [AVAILABLE]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(
      countTokensInZone(result.state, AVAILABLE, isTroop),
      3,
      '1 base casualty < 3 → condition true → 3 troops moved',
    );
  });

  it('moves 3 troops when 2 casualties (troop + base)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108003,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [makeUsTroop('cas-t1'), makeUsBase('cas-b1')],
        [OUT_OF_PLAY]: [makeUsTroop('oop-t1'), makeUsTroop('oop-t2'), makeUsTroop('oop-t3')],
        [AVAILABLE]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(
      countTokensInZone(result.state, AVAILABLE, isTroop),
      3,
      '2 casualties < 3 → condition true → 3 troops moved',
    );
  });

  it('clamps naturally when fewer than 3 troops in OOP', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108004,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [],
        [OUT_OF_PLAY]: [makeUsTroop('oop-t1')],
        [AVAILABLE]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(
      countTokensInZone(result.state, AVAILABLE, isTroop),
      1,
      'Only 1 troop in OOP → moves 1',
    );
    assert.equal(
      countTokensInZone(result.state, OUT_OF_PLAY, isTroop),
      0,
      'OOP should be empty',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  UNSHADED — condition false (3+ casualties)                        */
/* ------------------------------------------------------------------ */

describe('FITL card-108 Draft Dodgers unshaded — condition false', () => {
  it('no movement when exactly 3 casualties (3 is NOT < 3)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108005,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [makeUsTroop('cas-t1'), makeUsTroop('cas-t2'), makeUsTroop('cas-t3')],
        [OUT_OF_PLAY]: [makeUsTroop('oop-t1'), makeUsTroop('oop-t2'), makeUsTroop('oop-t3')],
        [AVAILABLE]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(
      countTokensInZone(result.state, AVAILABLE, isTroop),
      0,
      'Exactly 3 casualties → condition false → no troops moved',
    );
    assert.equal(
      countTokensInZone(result.state, OUT_OF_PLAY, isTroop),
      3,
      'OOP unchanged',
    );
  });

  it('no movement when 4 casualties (including bases)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108006,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [
          makeUsTroop('cas-t1'),
          makeUsTroop('cas-t2'),
          makeUsBase('cas-b1'),
          makeUsBase('cas-b2'),
        ],
        [OUT_OF_PLAY]: [makeUsTroop('oop-t1'), makeUsTroop('oop-t2'), makeUsTroop('oop-t3')],
        [AVAILABLE]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(
      countTokensInZone(result.state, AVAILABLE, isTroop),
      0,
      '4 casualties → condition false → no troops moved',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  UNSHADED — boundary: 0 troops in OOP                             */
/* ------------------------------------------------------------------ */

describe('FITL card-108 Draft Dodgers unshaded — boundary', () => {
  it('no-op when condition true but 0 troops in OOP', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108007,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [],
        [OUT_OF_PLAY]: [],
        [AVAILABLE]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(
      countTokensInZone(result.state, AVAILABLE, isTroop),
      0,
      'No troops in OOP → nothing to move',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  SHADED — standard cases                                           */
/* ------------------------------------------------------------------ */

describe('FITL card-108 Draft Dodgers shaded — standard cases', () => {
  it('moves 1 troop when 1 casualty', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108010,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [makeUsTroop('cas-t1')],
        [AVAILABLE]: [makeUsTroop('av-t1'), makeUsTroop('av-t2'), makeUsTroop('av-t3')],
        [OUT_OF_PLAY]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(
      countTokensInZone(result.state, OUT_OF_PLAY, isTroop),
      1,
      '1 casualty → move 1 troop to OOP',
    );
    assert.equal(
      countTokensInZone(result.state, AVAILABLE, isTroop),
      2,
      '2 troops remain in available',
    );
  });

  it('moves 2 troops when 2 casualties', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108011,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [makeUsTroop('cas-t1'), makeUsTroop('cas-t2')],
        [AVAILABLE]: [makeUsTroop('av-t1'), makeUsTroop('av-t2'), makeUsTroop('av-t3')],
        [OUT_OF_PLAY]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(
      countTokensInZone(result.state, OUT_OF_PLAY, isTroop),
      2,
      '2 casualties → move 2 troops to OOP',
    );
  });

  it('moves 3 troops when 3 casualties (at maximum)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108012,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [makeUsTroop('cas-t1'), makeUsTroop('cas-t2'), makeUsTroop('cas-t3')],
        [AVAILABLE]: [makeUsTroop('av-t1'), makeUsTroop('av-t2'), makeUsTroop('av-t3'), makeUsTroop('av-t4')],
        [OUT_OF_PLAY]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(
      countTokensInZone(result.state, OUT_OF_PLAY, isTroop),
      3,
      '3 casualties → move 3 troops to OOP',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  SHADED — cap at 3                                                 */
/* ------------------------------------------------------------------ */

describe('FITL card-108 Draft Dodgers shaded — cap at 3', () => {
  it('moves only 3 troops when 5 casualties (maximum cap)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108013,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [
          makeUsTroop('cas-t1'),
          makeUsTroop('cas-t2'),
          makeUsTroop('cas-t3'),
          makeUsTroop('cas-t4'),
          makeUsTroop('cas-t5'),
        ],
        [AVAILABLE]: [makeUsTroop('av-t1'), makeUsTroop('av-t2'), makeUsTroop('av-t3'), makeUsTroop('av-t4'), makeUsTroop('av-t5')],
        [OUT_OF_PLAY]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(
      countTokensInZone(result.state, OUT_OF_PLAY, isTroop),
      3,
      '5 casualties → capped at 3 troops moved',
    );
    assert.equal(
      countTokensInZone(result.state, AVAILABLE, isTroop),
      2,
      '5 - 3 = 2 troops remain in available',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  SHADED — bases count as casualty pieces                           */
/* ------------------------------------------------------------------ */

describe('FITL card-108 Draft Dodgers shaded — bases count as casualties', () => {
  it('counts bases as casualty pieces (1 base + 1 troop = 2 → moves 2)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108014,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [makeUsBase('cas-b1'), makeUsTroop('cas-t1')],
        [AVAILABLE]: [makeUsTroop('av-t1'), makeUsTroop('av-t2'), makeUsTroop('av-t3')],
        [OUT_OF_PLAY]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(
      countTokensInZone(result.state, OUT_OF_PLAY, isTroop),
      2,
      '1 base + 1 troop = 2 casualty pieces → move 2 troops',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  SHADED — 0 casualties                                             */
/* ------------------------------------------------------------------ */

describe('FITL card-108 Draft Dodgers shaded — 0 casualties', () => {
  it('no troops moved when 0 casualties (budget 0)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108015,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [],
        [AVAILABLE]: [makeUsTroop('av-t1'), makeUsTroop('av-t2'), makeUsTroop('av-t3')],
        [OUT_OF_PLAY]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(
      countTokensInZone(result.state, OUT_OF_PLAY, isTroop),
      0,
      '0 casualties → budget 0 → no troops moved',
    );
    assert.equal(
      countTokensInZone(result.state, AVAILABLE, isTroop),
      3,
      'Available unchanged',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  SHADED — fewer troops available than budget                       */
/* ------------------------------------------------------------------ */

describe('FITL card-108 Draft Dodgers shaded — clamping', () => {
  it('moves only 1 troop when 3 casualties but only 1 troop in available', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 108016,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES]: [makeUsTroop('cas-t1'), makeUsTroop('cas-t2'), makeUsTroop('cas-t3')],
        [AVAILABLE]: [makeUsTroop('av-t1')],
        [OUT_OF_PLAY]: [],
      },
    });
    const state: GameState = {
      ...base,
      markers: { ...withNeutralSupportOppositionMarkers(base) },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(
      countTokensInZone(result.state, OUT_OF_PLAY, isTroop),
      1,
      '3 casualties but only 1 troop available → moves 1',
    );
    assert.equal(
      countTokensInZone(result.state, AVAILABLE, isTroop),
      0,
      'Available should be empty',
    );
  });
});
