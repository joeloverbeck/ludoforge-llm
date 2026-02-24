import { describe, it } from 'node:test';

import {
  asActionId,
  asTokenId,
  assertValidatedGameDef,
  initialState,
  type GameState,
  type Token,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { initializeTurnFlowEligibilityState } from '../../src/kernel/turn-flow-eligibility.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  assertPlaybookSnapshot,
  replayPlaybookTurn,
  replayPlaybookTurns,
  type PlaybookTurn,
} from '../helpers/fitl-playbook-harness.js';

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
// Turn descriptors
// ---------------------------------------------------------------------------

// Turn 1 — Burning Bonze (card-107)
// Seat order: VC, NVA, US, ARVN → seats [3, 2, 0, 1]
// Move 1: VC plays shaded Burning Bonze event (shifts Saigon → neutral, aid -12)
// Move 2: NVA passes (+1 resource)
// Move 3: ARVN Train+Govern (Op+SA)
const TURN_1: PlaybookTurn = {
  label: 'Turn 1 — Burning Bonze',
  moves: [
    {
      kind: 'simple',
      label: 'VC shaded Burning Bonze',
      move: {
        actionId: asActionId('event'),
        params: { eventCardId: 'card-107', side: 'shaded' },
      },
    },
    {
      kind: 'simple',
      label: 'NVA passes',
      move: {
        actionId: asActionId('pass'),
        params: {},
      },
    },
    {
      kind: 'resolved',
      label: 'ARVN Train + Govern',
      move: {
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
      },
    },
  ],
  expectedEndState: {
    globalVars: {
      aid: 14,
      arvnResources: 24,
      nvaResources: 11,
      vcResources: 5,
      patronage: 15,
      trail: 1,
    },
    eligibility: { '0': true, '1': false, '2': true, '3': false },
    activePlayer: 2,
    currentCard: 'card-55',
    previewCard: 'card-68',
    deckSize: 10,
    seatOrder: ['2', '3', '0', '1'],
    firstEligible: '2',
    secondEligible: '0',
    nonPassCount: 0,
    zoneTokenCounts: [
      { zone: 'saigon:none', faction: 'ARVN', type: 'troops', count: 8 },
      { zone: 'saigon:none', faction: 'ARVN', type: 'police', count: 3 },
      { zone: 'saigon:none', faction: 'US', type: 'troops', count: 2 },
      { zone: 'saigon:none', faction: 'US', type: 'base', count: 1 },
    ],
    markers: [
      { space: 'saigon:none', marker: 'supportOpposition', expected: 'passiveSupport' },
    ],
  },
};

// Turn 2 — Trucks (card-55)
// Seat order: NVA, VC, US, ARVN → seats [2, 3, 0, 1]
// Move 1: NVA Rally (Op Only) in 4 spaces + trail improvement
//   - North Vietnam: +2 guerrillas (1 base + trail=1), underground
//   - Parrot's Beak: +2 guerrillas (1 base + trail=1), underground
//   - Kien Phong: +1 guerrilla (no base), underground
//   - Kien Giang: +1 guerrilla (no base), underground
//   - Cost: 4 resources (1/space) → 11 → 7
//   - Trail: 1 → 2, cost 2 → resources 7 → 5
// Move 2: US Sweep (Limited Op) in Quang Tri-Thua Thien
//   - VC (seat 3) skipped (ineligible from Turn 1)
//   - 2 sweepers activate 2 underground VC guerrillas
//   - Cost: 0
const TURN_2: PlaybookTurn = {
  label: 'Turn 2 — Trucks',
  moves: [
    {
      kind: 'resolved',
      label: 'NVA Rally (Op Only)',
      move: {
        actionId: asActionId('rally'),
        actionClass: 'operation',
        params: {
          targetSpaces: [
            'north-vietnam:none',
            'the-parrots-beak:none',
            'kien-phong:none',
            'kien-giang-an-xuyen:none',
          ],
          $improveTrail: 'yes',
        },
      },
    },
    {
      kind: 'resolved',
      label: 'US Sweep (Limited Op)',
      move: {
        actionId: asActionId('sweep'),
        actionClass: 'limitedOperation',
        params: {
          targetSpaces: ['quang-tri-thua-thien:none'],
        },
      },
    },
  ],
  expectedEndState: {
    globalVars: {
      nvaResources: 5,
      trail: 2,
      aid: 14,
      arvnResources: 24,
      vcResources: 5,
      patronage: 15,
    },
    eligibility: { '0': false, '1': true, '2': false, '3': true },
    activePlayer: 1,
    currentCard: 'card-68',
    previewCard: 'card-1',
    deckSize: 9,
    seatOrder: ['1', '0', '3', '2'],
    firstEligible: '1',
    secondEligible: '3',
    nonPassCount: 0,
    zoneTokenCounts: [
      // NVA Rally placements (all guerrillas underground)
      { zone: 'north-vietnam:none', faction: 'NVA', type: 'guerrilla', count: 5 },
      { zone: 'the-parrots-beak:none', faction: 'NVA', type: 'guerrilla', count: 5 },
      { zone: 'kien-phong:none', faction: 'NVA', type: 'guerrilla', count: 1 },
      { zone: 'kien-giang-an-xuyen:none', faction: 'NVA', type: 'guerrilla', count: 1 },
      // VC guerrillas in Quang Tri (activated by Sweep)
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 2,
        props: { activity: 'active' } },
    ],
    markers: [
      { space: 'saigon:none', marker: 'supportOpposition', expected: 'passiveSupport' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Playbook turns in execution order
// ---------------------------------------------------------------------------

const PLAYBOOK_TURNS: readonly PlaybookTurn[] = [TURN_1, TURN_2];

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
  const baseState = advanceToDecisionPoint(def, engineered);

  const stateBeforeTurn = (turnIndex: number): GameState => {
    if (turnIndex === 0) return baseState;
    return replayPlaybookTurns(def, baseState, PLAYBOOK_TURNS.slice(0, turnIndex));
  };

  it('initial state matches Full Game 1964 setup with playbook deck', () => {
    assertPlaybookSnapshot(baseState, {
      globalVars: {
        aid: 15,
        arvnResources: 30,
        nvaResources: 10,
        vcResources: 5,
        patronage: 15,
        trail: 1,
      },
      eligibility: { '0': true, '1': true, '2': true, '3': true },
      activePlayer: 3,
      currentCard: 'card-107',
      previewCard: 'card-55',
      deckSize: 11,
      zoneTokenCounts: [
        { zone: 'saigon:none', faction: 'US', type: 'troops', count: 2 },
        { zone: 'saigon:none', faction: 'US', type: 'base', count: 1 },
        { zone: 'saigon:none', faction: 'ARVN', type: 'troops', count: 2 },
        { zone: 'saigon:none', faction: 'ARVN', type: 'police', count: 3 },
      ],
      markers: [
        { space: 'saigon:none', marker: 'supportOpposition', expected: 'passiveSupport' },
      ],
    }, 'initial state');
  });

  for (const [turnIndex, turn] of PLAYBOOK_TURNS.entries()) {
    it(turn.label, () => {
      const start = stateBeforeTurn(turnIndex);
      replayPlaybookTurn(def, start, turn);
    });
  }
});
