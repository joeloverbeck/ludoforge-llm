import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asTokenId, type GameState, type Token } from '../../src/kernel/index.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import {
  assertEventText,
  countTokensInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
} from '../helpers/fitl-event-fidelity-helpers.js';

const CARD_ID = 'card-110';
const HUE = 'hue:none';
const DA_NANG = 'da-nang:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';
const SAIGON = 'saigon:none';
const CASUALTIES_US = 'casualties-US:none';

const isRangerOrIrregular = (t: Token): boolean =>
  t.props.type === 'ranger' || t.props.type === 'irregular';

const isGuerrilla = (t: Token): boolean => t.props.type === 'guerrilla';

const tokensInZone = (state: GameState, zoneId: string): readonly Token[] =>
  (state.zones[zoneId] ?? []) as readonly Token[];

// ── Compilation ──────────────────────────────────────────────────────────

describe('FITL card-110 No Contact — metadata', () => {
  it('compiles with correct text and no targets (effects-only)', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(card.title, 'No Contact');
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1964');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'NVA', 'ARVN', 'US']);

    assertEventText(def, CARD_ID, {
      unshaded: 'Place 2 Casualties onto the map. All Rangers and Irregulars Underground.',
      shaded: 'Flip all VC and NVA Guerrillas Underground.',
    });

    // Both sides are effects-only (no targets array)
    assert.equal(card.unshaded?.targets, undefined, 'Unshaded should have no targets');
    assert.equal(card.shaded?.targets, undefined, 'Shaded should have no targets');
  });
});

// ── Unshaded: Place 2 Casualties onto the map. All Rangers and Irregulars Underground. ──

describe('FITL card-110 No Contact unshaded — place casualties', () => {
  it('places 2 casualties onto chosen map spaces', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 110001,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES_US]: [
          makeFitlToken('us-cas-1', 'troops', 'US'),
          makeFitlToken('us-cas-2', 'troops', 'US'),
          makeFitlToken('us-cas-3', 'troops', 'US'),
        ],
      },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
        value: [asTokenId('us-cas-1'), asTokenId('us-cas-2')],
      },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[0]'), value: HUE },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[1]'), value: DA_NANG },
    ];

    const result = runEvent(def, state, CARD_ID, 'unshaded', { overrides });

    // 2 tokens placed on map
    assert.ok(
      tokensInZone(result.state, HUE).some((t) => String(t.id) === asTokenId('us-cas-1')),
      'us-cas-1 should be placed on Hue',
    );
    assert.ok(
      tokensInZone(result.state, DA_NANG).some((t) => String(t.id) === asTokenId('us-cas-2')),
      'us-cas-2 should be placed on Da Nang',
    );

    // 1 remains in casualties
    assert.equal(
      countTokensInZone(result.state, CASUALTIES_US, (t) => t.props.faction === 'US'),
      1,
      'One US casualty should remain',
    );
  });

  it('places fewer when fewer than 2 casualties exist', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 110002,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES_US]: [
          makeFitlToken('us-cas-only', 'troops', 'US'),
        ],
      },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
        value: [asTokenId('us-cas-only')],
      },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[0]'), value: HUE },
    ];

    const result = runEvent(def, state, CARD_ID, 'unshaded', { overrides });

    assert.ok(
      tokensInZone(result.state, HUE).some((t) => String(t.id) === asTokenId('us-cas-only')),
      'Single casualty should be placed on Hue',
    );
    assert.equal(
      countTokensInZone(result.state, CASUALTIES_US, (t) => t.props.faction === 'US'),
      0,
      'No US casualties should remain',
    );
  });

  it('places zero when casualties empty', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 110003,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES_US]: [],
      },
    });

    // No distributeTokens decisions needed — min:0 allows empty selection
    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
        value: [],
      },
    ];

    const result = runEvent(def, state, CARD_ID, 'unshaded', { overrides });
    assert.equal(
      countTokensInZone(result.state, CASUALTIES_US, () => true),
      0,
      'Casualties zone should remain empty',
    );
  });
});

describe('FITL card-110 No Contact unshaded — flip Rangers and Irregulars underground', () => {
  it('flips ALL active Rangers and Irregulars underground map-wide', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 110004,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES_US]: [],
        [HUE]: [
          makeFitlToken('ranger-hue-1', 'ranger', 'ARVN', { activity: 'active' }),
          makeFitlToken('irregular-hue-1', 'irregular', 'US', { activity: 'active' }),
        ],
        [DA_NANG]: [
          makeFitlToken('ranger-dn-1', 'ranger', 'ARVN', { activity: 'active' }),
        ],
        [QUANG_TRI]: [
          makeFitlToken('irregular-qt-1', 'irregular', 'US', { activity: 'active' }),
        ],
      },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
        value: [],
      },
    ];

    const result = runEvent(def, state, CARD_ID, 'unshaded', { overrides });

    // All 4 pieces should now be underground
    for (const [zoneId, expectedCount] of [[HUE, 2], [DA_NANG, 1], [QUANG_TRI, 1]] as const) {
      const underground = countTokensInZone(result.state, zoneId, (t) =>
        isRangerOrIrregular(t) && t.props.activity === 'underground',
      );
      assert.equal(underground, expectedCount, `Expected ${expectedCount} underground ranger/irregular in ${zoneId}`);
    }

    // No active rangers or irregulars should remain
    const activeRemaining = countTokensInZone(result.state, HUE, (t) =>
      isRangerOrIrregular(t) && t.props.activity === 'active',
    ) + countTokensInZone(result.state, DA_NANG, (t) =>
      isRangerOrIrregular(t) && t.props.activity === 'active',
    ) + countTokensInZone(result.state, QUANG_TRI, (t) =>
      isRangerOrIrregular(t) && t.props.activity === 'active',
    );
    assert.equal(activeRemaining, 0, 'No active rangers or irregulars should remain');
  });

  it('does not flip already-underground Rangers/Irregulars', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 110005,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES_US]: [],
        [HUE]: [
          makeFitlToken('ranger-hue-ug', 'ranger', 'ARVN', { activity: 'underground' }),
          makeFitlToken('irregular-hue-ug', 'irregular', 'US', { activity: 'underground' }),
        ],
      },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
        value: [],
      },
    ];

    const result = runEvent(def, state, CARD_ID, 'unshaded', { overrides });

    // Both should remain underground (no change)
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => isRangerOrIrregular(t) && t.props.activity === 'underground'),
      2,
      'Already-underground pieces should stay underground',
    );
  });

  it('does not flip Guerrillas, Troops, Police, or Bases', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 110006,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES_US]: [],
        [HUE]: [
          makeFitlToken('vc-g-hue', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('us-trp-hue', 'troops', 'US'),
          makeFitlToken('arvn-police-hue', 'police', 'ARVN'),
          makeFitlToken('us-base-hue', 'base', 'US'),
        ],
      },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
        value: [],
      },
    ];

    const result = runEvent(def, state, CARD_ID, 'unshaded', { overrides });

    // VC guerrilla should still be active (not affected)
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => t.props.faction === 'VC' && isGuerrilla(t) && t.props.activity === 'active'),
      1,
      'VC guerrilla should remain active',
    );

    // Troops, police, bases unchanged
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => t.props.type === 'troops'),
      1,
      'US troops should be unaffected',
    );
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => t.props.type === 'police'),
      1,
      'ARVN police should be unaffected',
    );
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => t.props.type === 'base'),
      1,
      'US base should be unaffected',
    );
  });
});

describe('FITL card-110 No Contact unshaded — combined placement and flip', () => {
  it('places casualties AND flips rangers/irregulars in same event', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 110007,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CASUALTIES_US]: [
          makeFitlToken('us-cas-combo-1', 'troops', 'US'),
          makeFitlToken('us-cas-combo-2', 'troops', 'US'),
        ],
        [HUE]: [
          makeFitlToken('ranger-combo-1', 'ranger', 'ARVN', { activity: 'active' }),
        ],
        [DA_NANG]: [
          makeFitlToken('irregular-combo-1', 'irregular', 'US', { activity: 'active' }),
        ],
      },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
        value: [asTokenId('us-cas-combo-1'), asTokenId('us-cas-combo-2')],
      },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[0]'), value: HUE },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[1]'), value: SAIGON },
    ];

    const result = runEvent(def, state, CARD_ID, 'unshaded', { overrides });

    // Casualties placed
    assert.ok(
      tokensInZone(result.state, HUE).some((t) => String(t.id) === asTokenId('us-cas-combo-1')),
      'First casualty should be on Hue',
    );
    assert.ok(
      tokensInZone(result.state, SAIGON).some((t) => String(t.id) === asTokenId('us-cas-combo-2')),
      'Second casualty should be on Saigon',
    );

    // Rangers/Irregulars flipped underground
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => t.props.type === 'ranger' && t.props.activity === 'underground'),
      1,
      'Ranger in Hue should be underground',
    );
    assert.equal(
      countTokensInZone(result.state, DA_NANG, (t) => t.props.type === 'irregular' && t.props.activity === 'underground'),
      1,
      'Irregular in Da Nang should be underground',
    );
  });
});

// ── Shaded: Flip all VC and NVA Guerrillas Underground. ─────────────────

describe('FITL card-110 No Contact shaded — flip guerrillas underground', () => {
  it('flips all active VC and NVA guerrillas underground across multiple spaces', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 110010,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [HUE]: [
          makeFitlToken('vc-g-hue-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('nva-g-hue-1', 'guerrilla', 'NVA', { activity: 'active' }),
        ],
        [DA_NANG]: [
          makeFitlToken('vc-g-dn-1', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [QUANG_TRI]: [
          makeFitlToken('nva-g-qt-1', 'guerrilla', 'NVA', { activity: 'active' }),
          makeFitlToken('nva-g-qt-2', 'guerrilla', 'NVA', { activity: 'active' }),
        ],
      },
    });

    const result = runEvent(def, state, CARD_ID, 'shaded');

    // All 5 guerrillas should be underground
    for (const [zoneId, expectedCount] of [[HUE, 2], [DA_NANG, 1], [QUANG_TRI, 2]] as const) {
      const underground = countTokensInZone(result.state, zoneId, (t) =>
        isGuerrilla(t) && (t.props.faction === 'VC' || t.props.faction === 'NVA') && t.props.activity === 'underground',
      );
      assert.equal(underground, expectedCount, `Expected ${expectedCount} underground guerrilla(s) in ${zoneId}`);
    }

    // No active VC/NVA guerrillas should remain
    const activeRemaining = [HUE, DA_NANG, QUANG_TRI].reduce(
      (sum, z) => sum + countTokensInZone(result.state, z, (t) =>
        isGuerrilla(t) && (t.props.faction === 'VC' || t.props.faction === 'NVA') && t.props.activity === 'active',
      ),
      0,
    );
    assert.equal(activeRemaining, 0, 'No active VC/NVA guerrillas should remain');
  });

  it('does not flip already-underground guerrillas', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 110011,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [HUE]: [
          makeFitlToken('vc-g-hue-ug', 'guerrilla', 'VC', { activity: 'underground' }),
          makeFitlToken('nva-g-hue-ug', 'guerrilla', 'NVA', { activity: 'underground' }),
        ],
      },
    });

    const result = runEvent(def, state, CARD_ID, 'shaded');

    assert.equal(
      countTokensInZone(result.state, HUE, (t) => isGuerrilla(t) && t.props.activity === 'underground'),
      2,
      'Already-underground guerrillas should stay underground',
    );
  });

  it('does not flip ARVN or US pieces', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 110012,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [HUE]: [
          makeFitlToken('ranger-hue-shaded', 'ranger', 'ARVN', { activity: 'active' }),
          makeFitlToken('irregular-hue-shaded', 'irregular', 'US', { activity: 'active' }),
          makeFitlToken('us-trp-hue-shaded', 'troops', 'US'),
        ],
      },
    });

    const result = runEvent(def, state, CARD_ID, 'shaded');

    // Rangers and Irregulars should still be active
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => t.props.type === 'ranger' && t.props.activity === 'active'),
      1,
      'ARVN ranger should remain active',
    );
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => t.props.type === 'irregular' && t.props.activity === 'active'),
      1,
      'US irregular should remain active',
    );
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => t.props.type === 'troops'),
      1,
      'US troops should be unaffected',
    );
  });

  it('does not flip NVA/VC bases or troops', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 110013,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [HUE]: [
          makeFitlToken('nva-trp-hue', 'troops', 'NVA'),
          makeFitlToken('vc-base-hue', 'base', 'VC'),
          makeFitlToken('vc-g-hue-active', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const result = runEvent(def, state, CARD_ID, 'shaded');

    // Only the guerrilla should flip
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => isGuerrilla(t) && t.props.activity === 'underground'),
      1,
      'VC guerrilla should be flipped underground',
    );
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => t.props.type === 'troops' && t.props.faction === 'NVA'),
      1,
      'NVA troops should be unaffected',
    );
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => t.props.type === 'base' && t.props.faction === 'VC'),
      1,
      'VC base should be unaffected',
    );
  });

  it('no-op when no active VC/NVA guerrillas exist', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 110014,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [HUE]: [
          makeFitlToken('vc-g-hue-already-ug', 'guerrilla', 'VC', { activity: 'underground' }),
          makeFitlToken('us-trp-hue-noop', 'troops', 'US'),
        ],
      },
    });

    const result = runEvent(def, state, CARD_ID, 'shaded');

    // Everything should be unchanged
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => isGuerrilla(t) && t.props.activity === 'underground'),
      1,
      'Underground guerrilla should remain',
    );
    assert.equal(
      countTokensInZone(result.state, HUE, (t) => t.props.type === 'troops'),
      1,
      'US troops should remain',
    );
  });
});
