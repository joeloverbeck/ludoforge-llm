import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  assertEventText,
  assertNoOpEvent,
  countTokensInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
} from './fitl-events-test-helpers.js';

const CARD_ID = 'card-120';
const PROVINCE_A = 'quang-tri-thua-thien:none';
const PROVINCE_B = 'binh-dinh:none';

describe('FITL card-120 US Press Corps', () => {
  // ─── Metadata & compilation ───

  it('compiles with correct text, metadata, and structural markers', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null, 'Expected valid GameDef');

    const def = compiled.gameDef!;
    const card = getEventCard(def, CARD_ID);

    assertEventText(def, CARD_ID, {
      title: 'US Press Corps',
      unshaded: 'Move US pieces from out of play to map; 4 if 0-2 cards in RVN Leader box, 2 if 3-5.',
      shaded: 'US Troop Casualties up to cards in RVN Leader box plus all US Base Casualties go out of play.',
    });
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1968');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'ARVN', 'NVA', 'US']);

    const serializedUnshaded = JSON.stringify(card.unshaded?.effects ?? []);
    assert.match(serializedUnshaded, /"out-of-play-US:none"/, 'Unshaded should reference out-of-play zone');
    assert.match(serializedUnshaded, /"leaderBoxCardCount"/, 'Unshaded should reference leaderBoxCardCount');
    assert.match(serializedUnshaded, /"mapSpaces"/, 'Unshaded should query mapSpaces for destinations');

    const serializedShaded = JSON.stringify(card.shaded?.effects ?? []);
    assert.match(serializedShaded, /"casualties-US:none"/, 'Shaded should reference casualties zone');
    assert.match(serializedShaded, /"out-of-play-US:none"/, 'Shaded should move to out-of-play');
    assert.match(serializedShaded, /"leaderBoxCardCount"/, 'Shaded should reference leaderBoxCardCount');
  });

  // ─── Unshaded tests ───

  it('unshaded happy path: leaderBoxCardCount=0, budget=4, places 4 US pieces on map', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120001,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'out-of-play-US:none': [
          makeFitlToken('upc-us-troop-1', 'troops', 'US'),
          makeFitlToken('upc-us-troop-2', 'troops', 'US'),
          makeFitlToken('upc-us-troop-3', 'troops', 'US'),
          makeFitlToken('upc-us-base-1', 'base', 'US'),
          makeFitlToken('upc-us-troop-4', 'troops', 'US'),
        ],
      },
      globalVars: { leaderBoxCardCount: 0 },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$usPressPieces', resolvedBind: '$usPressPieces' }),
        value: ['upc-us-troop-1', 'upc-us-troop-2', 'upc-us-troop-3', 'upc-us-troop-4'],
      },
      {
        when: matchesDecisionRequest({ namePattern: /^\$usPressDestination@/ }),
        value: PROVINCE_A,
      },
    ];

    const final = runEvent(def, state, CARD_ID, 'unshaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US'),
      1,
      'Out-of-play should have 1 US piece remaining (the base)',
    );
    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.props.faction === 'US' && t.type === 'troops'),
      4,
      'Province should have 4 US troops',
    );
  });

  it('unshaded reduced budget: leaderBoxCardCount=3, budget=2', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120002,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'out-of-play-US:none': [
          makeFitlToken('upc-rb-troop-1', 'troops', 'US'),
          makeFitlToken('upc-rb-troop-2', 'troops', 'US'),
          makeFitlToken('upc-rb-troop-3', 'troops', 'US'),
          makeFitlToken('upc-rb-troop-4', 'troops', 'US'),
        ],
      },
      globalVars: { leaderBoxCardCount: 3 },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$usPressPieces', resolvedBind: '$usPressPieces' }),
        value: ['upc-rb-troop-1', 'upc-rb-troop-2'],
      },
      {
        when: matchesDecisionRequest({ namePattern: /^\$usPressDestination@/ }),
        value: PROVINCE_A,
      },
    ];

    const final = runEvent(def, state, CARD_ID, 'unshaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US'),
      2,
      'Out-of-play should have 2 US troops remaining',
    );
    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.props.faction === 'US' && t.type === 'troops'),
      2,
      'Province should have 2 US troops',
    );
  });

  it('unshaded boundary: leaderBoxCardCount=2 gives budget=4', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120003,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'out-of-play-US:none': [
          makeFitlToken('upc-bd-troop-1', 'troops', 'US'),
          makeFitlToken('upc-bd-troop-2', 'troops', 'US'),
          makeFitlToken('upc-bd-troop-3', 'troops', 'US'),
          makeFitlToken('upc-bd-troop-4', 'troops', 'US'),
        ],
      },
      globalVars: { leaderBoxCardCount: 2 },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$usPressPieces', resolvedBind: '$usPressPieces' }),
        value: ['upc-bd-troop-1', 'upc-bd-troop-2', 'upc-bd-troop-3', 'upc-bd-troop-4'],
      },
      {
        when: matchesDecisionRequest({ namePattern: /^\$usPressDestination@/ }),
        value: PROVINCE_A,
      },
    ];

    const final = runEvent(def, state, CARD_ID, 'unshaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US'),
      0,
      'All 4 US pieces should be moved',
    );
    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.props.faction === 'US' && t.type === 'troops'),
      4,
      'Province should have all 4 US troops',
    );
  });

  it('unshaded depletion: only 2 pieces available, budget=4', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120004,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'out-of-play-US:none': [
          makeFitlToken('upc-dep-troop-1', 'troops', 'US'),
          makeFitlToken('upc-dep-troop-2', 'troops', 'US'),
        ],
      },
      globalVars: { leaderBoxCardCount: 0 },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$usPressPieces', resolvedBind: '$usPressPieces' }),
        value: ['upc-dep-troop-1', 'upc-dep-troop-2'],
      },
      {
        when: matchesDecisionRequest({ namePattern: /^\$usPressDestination@/ }),
        value: PROVINCE_A,
      },
    ];

    const final = runEvent(def, state, CARD_ID, 'unshaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US'),
      0,
      'All available pieces should be moved',
    );
    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.props.faction === 'US' && t.type === 'troops'),
      2,
      'Province should have 2 US troops',
    );
  });

  it('unshaded empty out-of-play: no-op', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120005,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {},
      globalVars: { leaderBoxCardCount: 0 },
    });

    assertNoOpEvent(def, state, CARD_ID, 'unshaded');
  });

  it('unshaded base stacking cap: base cannot go to space with 2 bases', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120006,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'out-of-play-US:none': [
          makeFitlToken('upc-bsc-base-1', 'base', 'US'),
        ],
        [PROVINCE_A]: [
          makeFitlToken('upc-bsc-existing-base-1', 'base', 'US'),
          makeFitlToken('upc-bsc-existing-base-2', 'base', 'ARVN'),
        ],
      },
      globalVars: { leaderBoxCardCount: 0 },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$usPressPieces', resolvedBind: '$usPressPieces' }),
        value: ['upc-bsc-base-1'],
      },
      {
        when: matchesDecisionRequest({ namePattern: /^\$usPressDestination@/ }),
        value: PROVINCE_B,
      },
    ];

    const final = runEvent(def, state, CARD_ID, 'unshaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, PROVINCE_B, (t) => t.type === 'base' && t.props.faction === 'US'),
      1,
      'Base should be placed in Province B (not Province A which has 2 bases)',
    );
    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.type === 'base'),
      2,
      'Province A should still have exactly 2 bases (stacking cap prevents placement)',
    );
  });

  it('unshaded base-as-piece: base selected and placed with stacking respected', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120007,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'out-of-play-US:none': [
          makeFitlToken('upc-bap-base-1', 'base', 'US'),
        ],
      },
      globalVars: { leaderBoxCardCount: 0 },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$usPressPieces', resolvedBind: '$usPressPieces' }),
        value: ['upc-bap-base-1'],
      },
      {
        when: matchesDecisionRequest({ namePattern: /^\$usPressDestination@/ }),
        value: PROVINCE_A,
      },
    ];

    const final = runEvent(def, state, CARD_ID, 'unshaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, PROVINCE_A, (t) => t.type === 'base' && t.props.faction === 'US'),
      1,
      'US base should be placed on the map',
    );
    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US'),
      0,
      'Out-of-play should be empty',
    );
  });

  // ─── Shaded tests ───

  it('shaded happy path: bases auto-moved + troops chosen up to leaderBoxCardCount', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120010,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'casualties-US:none': [
          makeFitlToken('upc-sh-base-1', 'base', 'US'),
          makeFitlToken('upc-sh-base-2', 'base', 'US'),
          makeFitlToken('upc-sh-troop-1', 'troops', 'US'),
          makeFitlToken('upc-sh-troop-2', 'troops', 'US'),
          makeFitlToken('upc-sh-troop-3', 'troops', 'US'),
          makeFitlToken('upc-sh-troop-4', 'troops', 'US'),
        ],
      },
      globalVars: { leaderBoxCardCount: 3 },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$usPressSelectedCasualties', resolvedBind: '$usPressSelectedCasualties' }),
        value: ['upc-sh-troop-1', 'upc-sh-troop-2', 'upc-sh-troop-3'],
      },
    ];

    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, 'casualties-US:none', (t) => t.props.faction === 'US' && t.type === 'base'),
      0,
      'All US bases should be moved out of casualties',
    );
    assert.equal(
      countTokensInZone(final, 'casualties-US:none', (t) => t.props.faction === 'US' && t.type === 'troops'),
      1,
      '1 US troop should remain in casualties',
    );
    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US' && t.type === 'base'),
      2,
      '2 US bases should be in out-of-play',
    );
    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US' && t.type === 'troops'),
      3,
      '3 US troops should be in out-of-play',
    );
  });

  it('shaded no bases in casualties: only troops selected', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120011,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'casualties-US:none': [
          makeFitlToken('upc-nb-troop-1', 'troops', 'US'),
          makeFitlToken('upc-nb-troop-2', 'troops', 'US'),
          makeFitlToken('upc-nb-troop-3', 'troops', 'US'),
        ],
      },
      globalVars: { leaderBoxCardCount: 2 },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$usPressSelectedCasualties', resolvedBind: '$usPressSelectedCasualties' }),
        value: ['upc-nb-troop-1', 'upc-nb-troop-2'],
      },
    ];

    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, 'casualties-US:none', (t) => t.props.faction === 'US' && t.type === 'troops'),
      1,
      '1 US troop should remain in casualties',
    );
    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US' && t.type === 'troops'),
      2,
      '2 US troops should be in out-of-play',
    );
  });

  it('shaded no non-base casualties: only bases auto-moved, chooseN max=0', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120012,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'casualties-US:none': [
          makeFitlToken('upc-nnb-base-1', 'base', 'US'),
          makeFitlToken('upc-nnb-base-2', 'base', 'US'),
        ],
      },
      globalVars: { leaderBoxCardCount: 3 },
    });

    const final = runEvent(def, state, CARD_ID, 'shaded').state;

    assert.equal(
      countTokensInZone(final, 'casualties-US:none', (t) => t.props.faction === 'US'),
      0,
      'All US pieces should be moved out of casualties',
    );
    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US' && t.type === 'base'),
      2,
      '2 US bases should be in out-of-play',
    );
  });

  it('shaded leaderBoxCardCount=0: only bases auto-moved, no troop selection', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120013,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'casualties-US:none': [
          makeFitlToken('upc-lbc0-base-1', 'base', 'US'),
          makeFitlToken('upc-lbc0-troop-1', 'troops', 'US'),
          makeFitlToken('upc-lbc0-troop-2', 'troops', 'US'),
        ],
      },
      globalVars: { leaderBoxCardCount: 0 },
    });

    const final = runEvent(def, state, CARD_ID, 'shaded').state;

    assert.equal(
      countTokensInZone(final, 'casualties-US:none', (t) => t.props.faction === 'US' && t.type === 'base'),
      0,
      'US base should be moved out of casualties',
    );
    assert.equal(
      countTokensInZone(final, 'casualties-US:none', (t) => t.props.faction === 'US' && t.type === 'troops'),
      2,
      'US troops should remain in casualties (leaderBoxCardCount=0)',
    );
    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US' && t.type === 'base'),
      1,
      '1 US base should be in out-of-play',
    );
  });

  it('shaded depletion: fewer troops than leaderBoxCardCount', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120014,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'casualties-US:none': [
          makeFitlToken('upc-sdep-troop-1', 'troops', 'US'),
          makeFitlToken('upc-sdep-troop-2', 'troops', 'US'),
        ],
      },
      globalVars: { leaderBoxCardCount: 5 },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$usPressSelectedCasualties', resolvedBind: '$usPressSelectedCasualties' }),
        value: ['upc-sdep-troop-1', 'upc-sdep-troop-2'],
      },
    ];

    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, 'casualties-US:none', (t) => t.props.faction === 'US'),
      0,
      'All US troops should be moved (max capped at 2)',
    );
    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US' && t.type === 'troops'),
      2,
      '2 US troops should be in out-of-play',
    );
  });

  it('shaded empty casualties: no-op', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120015,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {},
      globalVars: { leaderBoxCardCount: 3 },
    });

    assertNoOpEvent(def, state, CARD_ID, 'shaded');
  });

  it('shaded all casualties moved: bases + troops all move when leaderBoxCardCount >= troop count', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 120016,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'casualties-US:none': [
          makeFitlToken('upc-all-base-1', 'base', 'US'),
          makeFitlToken('upc-all-troop-1', 'troops', 'US'),
          makeFitlToken('upc-all-troop-2', 'troops', 'US'),
          makeFitlToken('upc-all-troop-3', 'troops', 'US'),
        ],
      },
      globalVars: { leaderBoxCardCount: 5 },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$usPressSelectedCasualties', resolvedBind: '$usPressSelectedCasualties' }),
        value: ['upc-all-troop-1', 'upc-all-troop-2', 'upc-all-troop-3'],
      },
    ];

    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, 'casualties-US:none', (t) => t.props.faction === 'US'),
      0,
      'All US pieces should be moved out of casualties',
    );
    assert.equal(
      countTokensInZone(final, 'out-of-play-US:none', (t) => t.props.faction === 'US'),
      4,
      'All 4 US pieces (1 base + 3 troops) should be in out-of-play',
    );
  });
});
