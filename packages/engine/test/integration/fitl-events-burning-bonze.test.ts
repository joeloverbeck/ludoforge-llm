import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type GameState } from '../../src/kernel/index.js';
import {
  getEventCard,
  getFitlEventDef,
  runEvent,
  setupFitlEventState,
} from '../helpers/fitl-event-fidelity-helpers.js';
import { withNeutralSupportOppositionMarkers } from '../helpers/isolated-state-helpers.js';

const CARD_ID = 'card-107';
const SAIGON = 'saigon:none';

const supportState = (state: GameState, zone: string): string =>
  String(state.markers[zone]?.supportOpposition ?? 'neutral');

describe('FITL card-107 Burning Bonze — metadata', () => {
  it('compiles with correct metadata', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(card.title, 'Burning Bonze');
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1964');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'NVA', 'ARVN', 'US']);
    assert.equal(
      card.unshaded?.text,
      'Patronage +3 or, if Saigon at Active Support, +6.',
    );
    assert.equal(
      card.shaded?.text,
      'Anti-regime self-immolation: Shift Saigon 1 level toward Active Opposition. Aid -12.',
    );
  });
});

describe('FITL card-107 Burning Bonze unshaded — Patronage +3 path', () => {
  it('adds 3 Patronage when Saigon at neutral', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107001,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 10 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'neutral' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(result.state.globalVars['patronage'], 13, 'Patronage should be 10 + 3 = 13');
  });

  it('adds 3 Patronage when Saigon at Passive Support', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107002,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 10 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'passiveSupport' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(result.state.globalVars['patronage'], 13, 'Patronage should be 10 + 3 = 13 (strict equality, not range)');
  });

  it('adds 3 Patronage when Saigon at Active Opposition', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107003,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 10 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'activeOpposition' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(result.state.globalVars['patronage'], 13, 'Patronage should be 10 + 3 = 13');
  });
});

describe('FITL card-107 Burning Bonze unshaded — Patronage +6 path', () => {
  it('adds 6 Patronage when Saigon at Active Support', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107004,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 10 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'activeSupport' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(result.state.globalVars['patronage'], 16, 'Patronage should be 10 + 6 = 16');
  });
});

describe('FITL card-107 Burning Bonze unshaded — clamping', () => {
  it('clamps at 75 when +6 would exceed max', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107005,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 72 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'activeSupport' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(result.state.globalVars['patronage'], 75, 'Patronage should clamp at 75 (72 + 6 = 78 → 75)');
  });

  it('clamps at 75 when +3 would exceed max', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107006,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 74 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'neutral' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(result.state.globalVars['patronage'], 75, 'Patronage should clamp at 75 (74 + 3 = 77 → 75)');
  });

  it('no change when already at 75 (neutral path)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107007,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 75 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'neutral' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(result.state.globalVars['patronage'], 75, 'Patronage should remain at 75');
  });

  it('no change when already at 75 (Active Support path)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107008,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 75 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'activeSupport' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(result.state.globalVars['patronage'], 75, 'Patronage should remain at 75');
  });
});

describe('FITL card-107 Burning Bonze shaded — shift toward Active Opposition', () => {
  it('shifts from Active Support to Passive Support', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107010,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { aid: 30 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'activeSupport' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(supportState(result.state, SAIGON), 'passiveSupport');
    assert.equal(result.state.globalVars['aid'], 18, 'Aid should be 30 - 12 = 18');
  });

  it('shifts from Passive Support to Neutral', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107011,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { aid: 30 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'passiveSupport' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(supportState(result.state, SAIGON), 'neutral');
    assert.equal(result.state.globalVars['aid'], 18);
  });

  it('shifts from Neutral to Passive Opposition', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107012,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { aid: 30 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'neutral' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(supportState(result.state, SAIGON), 'passiveOpposition');
    assert.equal(result.state.globalVars['aid'], 18);
  });

  it('shifts from Passive Opposition to Active Opposition', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107013,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { aid: 30 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'passiveOpposition' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(supportState(result.state, SAIGON), 'activeOpposition');
    assert.equal(result.state.globalVars['aid'], 18);
  });

  it('no shift when already at Active Opposition (boundary)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107014,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { aid: 30 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'activeOpposition' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(supportState(result.state, SAIGON), 'activeOpposition', 'Should remain at Active Opposition');
    assert.equal(result.state.globalVars['aid'], 18, 'Aid reduction should still apply');
  });
});

describe('FITL card-107 Burning Bonze shaded — Aid reduction', () => {
  it('reduces Aid by 12', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107015,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { aid: 30 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'neutral' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(result.state.globalVars['aid'], 18, 'Aid should be 30 - 12 = 18');
  });

  it('clamps Aid at 0 when less than 12', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107016,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { aid: 5 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'neutral' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(result.state.globalVars['aid'], 0, 'Aid should clamp at 0 (5 - 12 = -7 → 0)');
  });

  it('Aid stays 0 when already at 0', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 107017,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { aid: 0 },
    });
    const state: GameState = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [SAIGON]: { supportOpposition: 'neutral' },
      },
    };

    const result = runEvent(def, state, CARD_ID, 'shaded');
    assert.equal(result.state.globalVars['aid'], 0, 'Aid should remain at 0');
  });
});
