import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asTokenId,
  assertValidatedGameDef,
  initialState,
  type GameState,
  type Move,
  type Token,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { initializeTurnFlowEligibilityState } from '../../src/kernel/turn-flow-eligibility.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

// ---------------------------------------------------------------------------
// Playbook deck order (top to bottom)
// ---------------------------------------------------------------------------

const PLAYBOOK_DECK_IDS: readonly string[] = [
  'card-107', // 01 Burning Bonze
  'card-55',  // 02 Trucks
  'card-68',  // 03 Green Berets
  'card-1',   // 04 Gulf of Tonkin
  'card-97',  // 05 Brinks Hotel
  'card-79',  // 06 Henry Cabot Lodge
  'card-101', // 07 Booby Traps
  'card-125', // 08 Coup! Nguyen Khanh
  'card-75',  // 09 Sihanouk
  'card-17',  // 10 Claymores
  'card-51',  // 11 301st Supply Bn
  'card-43',  // 12 Economic Aid
  'card-112', // 13 Colonel Chau
];

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

const compileFitlDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

// ---------------------------------------------------------------------------
// Deck engineering — replace all card zones with the playbook's 13-card mini-deck
// ---------------------------------------------------------------------------

const COUP_CARD_ID = 'card-125';
const EVENT_DECK_ID = 'fitl-events-initial-card-pack';

const makeCardToken = (cardId: string, ordinal: number): Token => ({
  id: asTokenId(`tok___eventCard_playbook_${ordinal}`),
  type: '__eventCard',
  props: {
    cardId,
    eventDeckId: EVENT_DECK_ID,
    isCoup: cardId === COUP_CARD_ID,
  },
});

const engineerPlaybookDeck = (state: GameState): GameState => {
  // The pile-coup-mix-v1 materialization strategy randomly selects a subset
  // of event cards, so not all playbook cards may exist as tokens. We create
  // fresh tokens for the exact 13-card playbook mini-deck and replace all
  // card zones entirely.
  const startOrdinal = state.nextTokenOrdinal;
  const orderedCards = PLAYBOOK_DECK_IDS.map((cardId, index) =>
    makeCardToken(cardId, startOrdinal + index),
  );

  // Position 1 (top) → played:none (current card = Burning Bonze)
  // Position 2 → lookahead:none (preview card = Trucks)
  // Positions 3-13 → deck:none (remaining 11 cards)
  return {
    ...state,
    zones: {
      ...state.zones,
      'played:none': [orderedCards[0]!],
      'lookahead:none': [orderedCards[1]!],
      'deck:none': orderedCards.slice(2),
    },
    nextTokenOrdinal: startOrdinal + orderedCards.length,
  };
};

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

const assertGlobalVar = (state: GameState, varName: string, expected: number, label: string): void => {
  assert.equal(
    Number(state.globalVars[varName]),
    expected,
    `${label}: expected ${varName}=${expected}, got ${Number(state.globalVars[varName])}`,
  );
};

const countTokensInZone = (
  state: GameState,
  zoneId: string,
  faction: string,
  type: string,
): number =>
  (state.zones[zoneId] ?? []).filter(
    (token) => String(token.props.faction) === faction && String(token.props.type) === type,
  ).length;

const assertZoneTokenCount = (
  state: GameState,
  zoneId: string,
  faction: string,
  type: string,
  expected: number,
  label: string,
): void => {
  const actual = countTokensInZone(state, zoneId, faction, type);
  assert.equal(actual, expected, `${label}: expected ${faction} ${type} in ${zoneId} = ${expected}, got ${actual}`);
};

const assertMarkerState = (
  state: GameState,
  spaceId: string,
  markerId: string,
  expected: string,
  label: string,
): void => {
  const actual = state.markers[spaceId]?.[markerId];
  assert.equal(actual, expected, `${label}: expected ${markerId} at ${spaceId} = ${expected}, got ${String(actual)}`);
};

const assertEligibility = (state: GameState, seat: string, expected: boolean, label: string): void => {
  const runtime = requireCardDrivenRuntime(state);
  const actual = runtime.eligibility[seat];
  assert.equal(actual, expected, `${label}: expected seat ${seat} eligibility=${expected}, got ${actual}`);
};

const assertActivePlayer = (state: GameState, expected: number, label: string): void => {
  assert.equal(Number(state.activePlayer), expected, `${label}: expected activePlayer=${expected}, got ${Number(state.activePlayer)}`);
};

const zoneCount = (state: GameState, zoneId: string): number =>
  (state.zones[zoneId] ?? []).length;

const zoneHasCard = (state: GameState, zoneId: string, cardId: string): boolean =>
  (state.zones[zoneId] ?? []).some((token) => token.props.cardId === cardId);

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('FITL playbook golden suite', () => {
  const def = compileFitlDef();
  const raw = initialState(def, 42, 4).state;
  const withDeck = engineerPlaybookDeck(raw);
  // Re-initialize turn flow so the kernel reads the engineered first card's seat order.
  // (Deck engineering replaces cards after initialState, making the cached runtime stale.)
  const engineered = initializeTurnFlowEligibilityState(def, withDeck);
  let state = advanceToDecisionPoint(def, engineered);

  it('initial state matches Full Game 1964 setup with playbook deck', () => {
    // Card lifecycle: Burning Bonze current, Trucks preview
    assert.ok(zoneHasCard(state, 'played:none', 'card-107'), 'Burning Bonze should be in played:none');
    assert.ok(zoneHasCard(state, 'lookahead:none', 'card-55'), 'Trucks should be in lookahead:none');
    assert.equal(zoneCount(state, 'deck:none'), 11, 'deck should have 11 remaining cards');

    // All factions eligible
    assertEligibility(state, '0', true, 'setup US');
    assertEligibility(state, '1', true, 'setup ARVN');
    assertEligibility(state, '2', true, 'setup NVA');
    assertEligibility(state, '3', true, 'setup VC');

    // Active player is VC (seat 3) — first in Burning Bonze seat order
    assertActivePlayer(state, 3, 'setup');

    // Global variables
    assertGlobalVar(state, 'aid', 15, 'setup');
    assertGlobalVar(state, 'arvnResources', 30, 'setup');
    assertGlobalVar(state, 'nvaResources', 10, 'setup');
    assertGlobalVar(state, 'vcResources', 5, 'setup');
    assertGlobalVar(state, 'patronage', 15, 'setup');
    assertGlobalVar(state, 'trail', 1, 'setup');

    // Saigon setup
    assertMarkerState(state, 'saigon:none', 'supportOpposition', 'passiveSupport', 'setup Saigon');
    assertZoneTokenCount(state, 'saigon:none', 'US', 'troops', 2, 'setup Saigon');
    assertZoneTokenCount(state, 'saigon:none', 'US', 'base', 1, 'setup Saigon');
    assertZoneTokenCount(state, 'saigon:none', 'ARVN', 'troops', 2, 'setup Saigon');
    assertZoneTokenCount(state, 'saigon:none', 'ARVN', 'police', 3, 'setup Saigon');
  });

  // -------------------------------------------------------------------------
  // Turn 1 Move 1: VC plays shaded Burning Bonze event
  // -------------------------------------------------------------------------

  it('Move 1: VC shaded Burning Bonze shifts Saigon to neutral and reduces aid', () => {
    const move: Move = {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-107', side: 'shaded' },
    };

    const result = applyMove(def, state, move);
    state = result.state;

    // Saigon shifted 1 level toward Active Opposition: passiveSupport -> neutral
    assertMarkerState(state, 'saigon:none', 'supportOpposition', 'neutral', 'Move 1 Saigon');

    // Aid reduced by 12: 15 -> 3
    assertGlobalVar(state, 'aid', 3, 'Move 1');

    // Active player advances to NVA (seat 2), next in Burning Bonze seat order
    assertActivePlayer(state, 2, 'Move 1');
  });

  // -------------------------------------------------------------------------
  // Turn 1 Move 2: NVA passes
  // -------------------------------------------------------------------------

  it('Move 2: NVA passes, gains +1 resource, ARVN becomes active', () => {
    const move: Move = {
      actionId: asActionId('pass'),
      params: {},
    };

    const result = applyMove(def, state, move);
    state = result.state;

    // NVA gains +1 insurgent pass reward: 10 -> 11
    assertGlobalVar(state, 'nvaResources', 11, 'Move 2');

    // Active player advances to ARVN (seat 1)
    assertActivePlayer(state, 1, 'Move 2');
  });

  // -------------------------------------------------------------------------
  // Turn 1 Move 3: ARVN Op & Special Activity (Train + Govern)
  // -------------------------------------------------------------------------

  it('Move 3: ARVN Train in Saigon with Pacify, then Govern in An Loc + Can Tho', () => {
    const result = applyMoveWithResolvedDecisionIds(def, state, {
      actionId: asActionId('train'),
      actionClass: 'operationPlusSpecialActivity',
      params: {
        targetSpaces: ['saigon:none'],
        $trainChoice: 'arvn-cubes',
        $subActionSpaces: ['saigon:none'],
        $subAction: 'pacify',
        $pacLevels: 1,
      },
      compound: {
        specialActivity: {
          actionId: asActionId('govern'),
          actionClass: 'operationPlusSpecialActivity',
          params: {
            targetSpaces: ['an-loc:none', 'can-tho:none'],
            '$governMode@an-loc:none': 'aid',
            '$governMode@can-tho:none': 'aid',
          },
        },
        timing: 'after',
      },
    });
    state = result.state;

    // ARVN resources: 30 - 3 (train) - 3 (pacify) = 24
    assertGlobalVar(state, 'arvnResources', 24, 'Move 3');

    // Saigon shifted 1 level toward support: neutral -> passiveSupport
    assertMarkerState(state, 'saigon:none', 'supportOpposition', 'passiveSupport', 'Move 3 Saigon');

    // Saigon troops: 2 original + 6 placed = 8 ARVN troops, 3 ARVN police unchanged
    assertZoneTokenCount(state, 'saigon:none', 'ARVN', 'troops', 8, 'Move 3 Saigon');
    assertZoneTokenCount(state, 'saigon:none', 'ARVN', 'police', 3, 'Move 3 Saigon');

    // Aid: 3 (from Move 1) + 6 (govern) + 5 (Minh leader bonus) = 14
    assertGlobalVar(state, 'aid', 14, 'Move 3');
  });

  // -------------------------------------------------------------------------
  // Turn 1 end-of-turn: eligibility, card lifecycle
  // -------------------------------------------------------------------------

  it('end of Turn 1: VC and ARVN ineligible, NVA and US eligible, card state reset', () => {
    // After 2 eligible factions acted (VC 1st, ARVN 2nd), the card-driven flow
    // ends the card: resets nonPassCount, updates eligibility, transitions card zones,
    // reads the new card's seat order, and advances active player.

    // VC (seat 3) and ARVN (seat 1) → Ineligible
    assertEligibility(state, '3', false, 'end-of-turn VC');
    assertEligibility(state, '1', false, 'end-of-turn ARVN');

    // NVA (seat 2) who passed → Eligible; US (seat 0) who didn't act → Eligible
    assertEligibility(state, '2', true, 'end-of-turn NVA');
    assertEligibility(state, '0', true, 'end-of-turn US');

    // Card-driven flow reset: nonPassCount back to 0, new first/second eligible
    // Trucks seat order: NVA, VC, US, ARVN → eligible: NVA (2), US (0)
    const runtime = requireCardDrivenRuntime(state);
    assert.equal(runtime.currentCard.nonPassCount, 0, 'nonPassCount should reset to 0 after card end');
    assert.equal(runtime.currentCard.firstEligible, '2', 'NVA (seat 2) should be first eligible');
    assert.equal(runtime.currentCard.secondEligible, '0', 'US (seat 0) should be second eligible');

    // Seat order updated to Trucks card: ["2", "3", "0", "1"] = NVA, VC, US, ARVN
    assert.deepEqual(
      runtime.seatOrder,
      ['2', '3', '0', '1'],
      'seatOrder should reflect Trucks card order',
    );

    // Active player advances to NVA (seat 2) — first eligible for Trucks card
    assertActivePlayer(state, 2, 'end-of-turn');

    // Card zones transitioned: Burning Bonze discarded, Trucks promoted, Green Berets revealed
    assert.ok(zoneHasCard(state, 'played:none', 'card-55'), 'Trucks should be in played:none');
    assert.ok(zoneHasCard(state, 'lookahead:none', 'card-68'), 'Green Berets should be in lookahead:none');
    assert.equal(zoneCount(state, 'deck:none'), 10, 'deck should have 10 remaining cards');

    // US troops and base in Saigon unchanged
    assertZoneTokenCount(state, 'saigon:none', 'US', 'troops', 2, 'end-of-turn Saigon');
    assertZoneTokenCount(state, 'saigon:none', 'US', 'base', 1, 'end-of-turn Saigon');
  });
});
