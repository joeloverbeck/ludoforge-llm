import { describe, it } from 'node:test';

import {
  asActionId,
  asTokenId,
  assertValidatedGameDef,
  type ChoicePendingRequest,
  computeVictoryMarker,
  initialState,
  type GameDef,
  type GameState,
  type MarkerWeightConfig,
  type SeatGroupConfig,
  type Token,
  type ValidatedGameDef,
  type VictoryFormula,
  type ZoneDef,
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
import { type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';

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

const createTurn4EventDecisionOverrides = (): readonly DecisionOverrideRule[] => {
  let cityAssignmentIndex = 0;
  return [
    {
      when: (request: ChoicePendingRequest) =>
        request.type === 'chooseN' && request.name.includes('$selectedPieces'),
      value: (request: ChoicePendingRequest) =>
        request.options
          .map((option) => option.value)
          .filter((value): value is string => typeof value === 'string')
          .slice(0, 6),
    },
    {
      when: (request: ChoicePendingRequest) => request.name.includes('$targetCity@'),
      value: (request: ChoicePendingRequest) => {
        const saigon = request.options.find((option) => option.value === 'saigon:none')?.value;
        const hue = request.options.find((option) => option.value === 'hue:none')?.value;
        const fallback = request.options[0]?.value;
        const selected = cityAssignmentIndex < 2
          ? (saigon ?? fallback)
          : (hue ?? fallback);
        cityAssignmentIndex += 1;
        return selected;
      },
    },
  ];
};

const createTurn4NvaReportBranchDecisionOverrides = (): readonly DecisionOverrideRule[] => [
  {
    when: (request: ChoicePendingRequest) =>
      request.name === 'targetSpaces'
      && request.decisionId.includes('doc.actionPipelines.10.stages[0].effects.0'),
    value: [
      'kien-phong:none',
      'kien-giang-an-xuyen:none',
      'quang-tri-thua-thien:none',
    ],
  },
  {
    when: (request: ChoicePendingRequest) => request.name === '$movingGuerrillas@kien-phong:none',
    value: (request: ChoicePendingRequest) =>
      request.options
        .map((option) => option.value)
        .filter((value): value is string => typeof value === 'string')
        .filter((value) => /_(204|205|85|84|83)$/.test(value))
        .slice(0, 2),
  },
  {
    when: (request: ChoicePendingRequest) => request.name === '$movingTroops@kien-phong:none',
    value: [],
  },
  {
    when: (request: ChoicePendingRequest) => request.name === '$movingTroops@quang-tri-thua-thien:none',
    value: [],
  },
  {
    when: (request: ChoicePendingRequest) => request.name === '$movingGuerrillas@quang-tri-thua-thien:none',
    value: (request: ChoicePendingRequest) =>
      request.options
        .map((option) => option.value)
        .filter((value): value is string => typeof value === 'string')
        .filter((value) => !/_(204|205|85|84|83)$/.test(value))
        .slice(0, 7),
  },
  {
    when: (request: ChoicePendingRequest) => request.name === '$movingGuerrillas@kien-giang-an-xuyen:none',
    value: (request: ChoicePendingRequest) =>
      request.options
        .map((option) => option.value)
        .filter((value): value is string => typeof value === 'string')
        .filter((value) => /_(85|84|83)$/.test(value))
        .slice(0, 2),
  },
  {
    when: (request: ChoicePendingRequest) => request.name === '$movingTroops@kien-giang-an-xuyen:none',
    value: [],
  },
  {
    when: (request: ChoicePendingRequest) => request.name === 'chainSpaces',
    value: [],
  },
  {
    when: (request: ChoicePendingRequest) =>
      request.name === 'targetSpaces'
      && request.decisionId.includes('doc.actionPipelines.22.stages[0].effects.0'),
    value: ['southern-laos:none', 'kien-giang-an-xuyen:none'],
  },
  {
    when: (request: ChoicePendingRequest) => request.name === '$infiltrateMode@southern-laos:none',
    value: 'build-up',
  },
  {
    when: (request: ChoicePendingRequest) => request.name === '$infiltrateGuerrillasToReplace@southern-laos:none',
    value: (request: ChoicePendingRequest) =>
      request.options
        .map((option) => option.value)
        .filter((value): value is string => typeof value === 'string'),
  },
  {
    when: (request: ChoicePendingRequest) => request.name === '$infiltrateMode@kien-giang-an-xuyen:none',
    value: 'takeover',
  },
  {
    when: (request: ChoicePendingRequest) => request.name === '$infiltrateTakeoverReplace@kien-giang-an-xuyen:none',
    value: 'yes',
  },
  {
    when: (request: ChoicePendingRequest) => request.name === '$infiltrateTakeoverTargetType@kien-giang-an-xuyen:none',
    value: 'guerrilla',
  },
];

const FITL_FACTION_CONFIG: SeatGroupConfig = {
  coinSeats: ['US', 'ARVN'],
  insurgentSeats: ['NVA', 'VC'],
  soloSeat: 'NVA',
  seatProp: 'faction',
};

const FITL_OPPOSITION_CONFIG: MarkerWeightConfig = {
  activeState: 'activeOpposition',
  passiveState: 'passiveOpposition',
};

const FITL_VC_FORMULA: VictoryFormula = {
  type: 'markerTotalPlusMapBases',
  markerConfig: FITL_OPPOSITION_CONFIG,
  baseSeat: 'VC',
  basePieceTypes: ['vc-bases'],
};

const FITL_NVA_FORMULA: VictoryFormula = {
  type: 'controlledPopulationPlusMapBases',
  controlFn: 'solo',
  baseSeat: 'NVA',
  basePieceTypes: ['nva-bases'],
};

const FITL_ARVN_FORMULA: VictoryFormula = {
  type: 'controlledPopulationPlusGlobalVar',
  controlFn: 'coin',
  varName: 'patronage',
};

const DERIVED_METRICS_CONTEXT = {
  derivedMetrics: [
    {
      id: 'playbook-marker-total',
      computation: 'markerTotal',
      requirements: [{ key: 'population', expectedType: 'number' }],
    },
    {
      id: 'playbook-controlled-pop',
      computation: 'controlledPopulation',
      requirements: [{ key: 'population', expectedType: 'number' }],
    },
  ],
} as const;

const mapSpaces = (def: GameDef): readonly ZoneDef[] =>
  def.zones.filter((zone) =>
    zone.zoneKind === 'board' || zone.category === 'city' || zone.category === 'province'
    || zone.category === 'loc');

const supportOppositionBySpace = (
  def: GameDef,
  state: GameState,
): Readonly<Record<string, string>> => {
  const markerStates: Record<string, string> = {};
  for (const zone of mapSpaces(def)) {
    markerStates[zone.id] = state.markers[zone.id]?.supportOpposition ?? 'neutral';
  }
  return markerStates;
};

const computeVcVictory = (def: GameDef, state: GameState): number =>
  computeVictoryMarker(
    DERIVED_METRICS_CONTEXT,
    state,
    mapSpaces(def),
    supportOppositionBySpace(def, state),
    FITL_FACTION_CONFIG,
    FITL_VC_FORMULA,
  );

const computeNvaVictory = (def: GameDef, state: GameState): number =>
  computeVictoryMarker(
    DERIVED_METRICS_CONTEXT,
    state,
    mapSpaces(def),
    supportOppositionBySpace(def, state),
    FITL_FACTION_CONFIG,
    FITL_NVA_FORMULA,
  );

const computeArvnVictory = (def: GameDef, state: GameState): number =>
  computeVictoryMarker(
    DERIVED_METRICS_CONTEXT,
    state,
    mapSpaces(def),
    supportOppositionBySpace(def, state),
    FITL_FACTION_CONFIG,
    FITL_ARVN_FORMULA,
  );

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

// Turn 3 — Green Berets (card-68)
// Seat order: ARVN, US, VC, NVA → seats [1, 0, 3, 2]
// Move 1: ARVN plays unshaded Green Berets event
//   - Branch: place-irregulars-and-support
//   - Target: binh-dinh:none (Province without NVA Control)
//   - Places 3 US Irregulars from available-US:none → binh-dinh:none (underground)
//   - Sets Binh Dinh to Active Support
// Move 2: VC Rally + Tax (Op+SA compound)
//   - Rally in Pleiku (2 guerrillas), Quang Tri (3 guerrillas), Hue (1 guerrilla)
//   - Cost: 3 resources → vcResources 5 → 2
//   - Tax in Quang Tin, Quang Duc, Binh Tuy
//   - Tax flips 1 guerrilla active per space, gains pop×2 resources, shifts 1 level toward support
//   - Tax resources: (2+1+1)×2 = 8 → vcResources 2 → 10
//   - Tax shifts: activeOpposition → passiveOpposition in all 3 spaces
const TURN_3: PlaybookTurn = {
  label: 'Turn 3 — Green Berets',
  moves: [
    {
      kind: 'resolved',
      label: 'ARVN unshaded Green Berets (place irregulars in Binh Dinh)',
      move: {
        actionId: asActionId('event'),
        params: {
          eventCardId: 'card-68',
          side: 'unshaded',
          branch: 'place-irregulars-and-support',
          $targetProvince: 'binh-dinh:none',
        },
      },
      expectedState: {
        globalVars: {
          aid: 14,
          arvnResources: 24,
          patronage: 15,
        },
        zoneTokenCounts: [
          // 3 irregulars placed from available-US:none + 1 initial = 4 total
          { zone: 'binh-dinh:none', faction: 'US', type: 'irregular', count: 4 },
          { zone: 'available-US:none', faction: 'US', type: 'irregular', count: 0 },
        ],
        totalTokenCounts: [
          { faction: 'US', type: 'irregular', count: 6 },
        ],
        markers: [
          { space: 'binh-dinh:none', marker: 'supportOpposition', expected: 'activeSupport' },
          { space: 'saigon:none', marker: 'supportOpposition', expected: 'passiveSupport' },
        ],
      },
    },
    {
      kind: 'resolved',
      label: 'VC Rally + Tax',
      move: {
        actionId: asActionId('rally'),
        actionClass: 'operationPlusSpecialActivity',
        params: {
          targetSpaces: ['pleiku-darlac:none', 'quang-tri-thua-thien:none', 'hue:none'],
          $withBaseChoice: 'place-guerrillas',
          $noBaseChoice: 'place-guerrilla',
        },
        compound: {
          specialActivity: {
            actionId: asActionId('tax'),
            actionClass: 'operationPlusSpecialActivity',
            params: {
              targetSpaces: [
                'quang-tin-quang-ngai:none',
                'quang-duc-long-khanh:none',
                'binh-tuy-binh-thuan:none',
              ],
            },
          },
          timing: 'after',
        },
      },
      expectedOperationState: {
        globalVars: {
          nvaResources: 5,
          trail: 2,
          vcResources: 2,
          arvnResources: 24,
          aid: 14,
          patronage: 15,
        },
        zoneTokenCounts: [
          { zone: 'pleiku-darlac:none', faction: 'VC', type: 'guerrilla', count: 4 },
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 5 },
          { zone: 'hue:none', faction: 'VC', type: 'guerrilla', count: 1 },
          { zone: 'quang-tin-quang-ngai:none', faction: 'VC', type: 'guerrilla',
            count: 0, props: { activity: 'active' } },
          { zone: 'quang-duc-long-khanh:none', faction: 'VC', type: 'guerrilla',
            count: 0, props: { activity: 'active' } },
          { zone: 'binh-tuy-binh-thuan:none', faction: 'VC', type: 'guerrilla',
            count: 0, props: { activity: 'active' } },
        ],
        totalTokenCounts: [
          { faction: 'VC', type: 'guerrilla', count: 30 },
        ],
        markers: [
          { space: 'quang-tin-quang-ngai:none', marker: 'supportOpposition', expected: 'activeOpposition' },
          { space: 'quang-duc-long-khanh:none', marker: 'supportOpposition', expected: 'activeOpposition' },
          { space: 'binh-tuy-binh-thuan:none', marker: 'supportOpposition', expected: 'activeOpposition' },
        ],
      },
    },
  ],
  expectedEndState: {
    globalVars: {
      nvaResources: 5,
      trail: 2,
      vcResources: 10,
      arvnResources: 24,
      aid: 14,
      patronage: 15,
    },
    eligibility: { '0': true, '1': false, '2': true, '3': false },
    activePlayer: 0,
    currentCard: 'card-1',
    previewCard: 'card-97',
    deckSize: 8,
    seatOrder: ['0', '2', '1', '3'],
    firstEligible: '0',
    secondEligible: '2',
    nonPassCount: 0,
    zoneTokenCounts: [
      // Green Berets event placements
      { zone: 'binh-dinh:none', faction: 'US', type: 'irregular', count: 4 },
      { zone: 'available-US:none', faction: 'US', type: 'irregular', count: 0 },
      // VC Rally placements (all underground)
      { zone: 'pleiku-darlac:none', faction: 'VC', type: 'guerrilla', count: 4 },
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 5 },
      { zone: 'hue:none', faction: 'VC', type: 'guerrilla', count: 1 },
      // Tax flipped guerrillas (1 active per space)
      { zone: 'quang-tin-quang-ngai:none', faction: 'VC', type: 'guerrilla',
        count: 1, props: { activity: 'active' } },
      { zone: 'quang-duc-long-khanh:none', faction: 'VC', type: 'guerrilla',
        count: 1, props: { activity: 'active' } },
      { zone: 'binh-tuy-binh-thuan:none', faction: 'VC', type: 'guerrilla',
        count: 1, props: { activity: 'active' } },
    ],
    totalTokenCounts: [
      { faction: 'US', type: 'irregular', count: 6 },
      { faction: 'VC', type: 'guerrilla', count: 30 },
    ],
    markers: [
      { space: 'saigon:none', marker: 'supportOpposition', expected: 'passiveSupport' },
      { space: 'binh-dinh:none', marker: 'supportOpposition', expected: 'activeSupport' },
      { space: 'quang-tin-quang-ngai:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
      { space: 'quang-duc-long-khanh:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
      { space: 'binh-tuy-binh-thuan:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
    ],
  },
};

// Turn 4 — Gulf of Tonkin (card-1)
// Seat order: US, NVA, ARVN, VC → seats [0, 2, 1, 3]
// Move 1: US plays unshaded Gulf of Tonkin event
//   - Free US Air Strike grant is enqueued
//   - Event effects are deferred (effectTiming=afterGrants)
// Move 2: US resolves free Air Strike in Quang Tri
//   - Removes 2 active VC guerrillas, shifts Quang Tri to Passive Opposition
//   - Degrades Trail 2 -> 1
//   - Consumes grant and releases deferred deployment (6 US out-of-play pieces to cities)
// Move 3: NVA March + Infiltrate (Op+SA)
//   - Explicitly force the playbook narrative branch:
//     Quang Tri + Kien Phong + Kien Giang March, then Southern Laos + Kien Giang Infiltrate
const TURN_4: PlaybookTurn = {
  label: 'Turn 4 — Gulf of Tonkin',
  moves: [
    {
      kind: 'resolved',
      label: 'US unshaded Gulf of Tonkin',
      move: {
        actionId: asActionId('event'),
        params: {
          eventCardId: 'card-1',
          side: 'unshaded',
        },
      },
      options: {
        overrides: createTurn4EventDecisionOverrides(),
      },
      expectedState: {
        globalVars: {
          nvaResources: 5,
          trail: 2,
          vcResources: 10,
          arvnResources: 24,
          aid: 14,
          patronage: 15,
        },
        zoneTokenCounts: [
          // Deferred deployment has not resolved yet.
          { zone: 'out-of-play-US:none', faction: 'US', type: 'troops', count: 10 },
          { zone: 'out-of-play-US:none', faction: 'US', type: 'base', count: 2 },
          { zone: 'saigon:none', faction: 'US', type: 'troops', count: 2 },
          { zone: 'hue:none', faction: 'US', type: 'troops', count: 0 },
        ],
        computedValues: [
          {
            label: 'pending free-operation grants',
            expected: 1,
            compute: (_def, state) =>
              state.turnOrderState.type === 'cardDriven'
                ? (state.turnOrderState.runtime.pendingFreeOperationGrants ?? []).length
                : 0,
          },
        ],
      },
    },
    {
      kind: 'resolved',
      label: 'US free Air Strike in Quang Tri',
      move: {
        actionId: asActionId('airStrike'),
        actionClass: 'operation',
        freeOperation: true,
        params: {
          spaces: ['quang-tri-thua-thien:none'],
          $degradeTrail: 'yes',
        },
      },
      expectedState: {
        globalVars: {
          nvaResources: 5,
          trail: 1,
          vcResources: 10,
          arvnResources: 24,
          aid: 14,
          patronage: 15,
        },
        zoneTokenCounts: [
          { zone: 'available-VC:none', faction: 'VC', type: 'guerrilla', count: 10 },
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 3 },
          { zone: 'out-of-play-US:none', faction: 'US', type: 'troops', count: 4 },
          { zone: 'out-of-play-US:none', faction: 'US', type: 'base', count: 2 },
        ],
        markers: [
          { space: 'quang-tri-thua-thien:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
        ],
        computedValues: [
          { label: 'VC victory marker', expected: 25, compute: computeVcVictory },
        ],
      },
    },
    {
      kind: 'resolved',
      label: 'NVA March + Infiltrate',
      move: {
        actionId: asActionId('march'),
        actionClass: 'operationPlusSpecialActivity',
        params: {},
        compound: {
          specialActivity: {
            actionId: asActionId('infiltrate'),
            actionClass: 'operationPlusSpecialActivity',
            params: {},
          },
          timing: 'after',
        },
      },
      options: {
        overrides: createTurn4NvaReportBranchDecisionOverrides(),
      },
      expectedState: {
        globalVars: {
          nvaResources: 2,
          trail: 1,
          infiltrateCount: 1,
          vcResources: 10,
          arvnResources: 24,
          aid: 14,
          patronage: 15,
        },
        zoneTokenCounts: [
          { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 7 },
          { zone: 'kien-phong:none', faction: 'NVA', type: 'guerrilla', count: 3 },
          { zone: 'kien-giang-an-xuyen:none', faction: 'NVA', type: 'guerrilla', count: 4 },
          { zone: 'kien-giang-an-xuyen:none', faction: 'VC', type: 'guerrilla', count: 0 },
          { zone: 'southern-laos:none', faction: 'NVA', type: 'troops', count: 5 },
          { zone: 'southern-laos:none', faction: 'NVA', type: 'guerrilla', count: 0 },
        ],
        markers: [
          { space: 'kien-giang-an-xuyen:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
        ],
        computedValues: [
          { label: 'VC victory marker', expected: 23, compute: computeVcVictory },
        ],
      },
    },
  ],
  expectedEndState: {
    globalVars: {
      nvaResources: 2,
      trail: 1,
      infiltrateCount: 1,
      vcResources: 10,
      arvnResources: 24,
      aid: 14,
      patronage: 15,
    },
    eligibility: { '0': false, '1': true, '2': false, '3': true },
    activePlayer: 3,
    currentCard: 'card-97',
    previewCard: 'card-79',
    deckSize: 7,
    seatOrder: ['3', '0', '1', '2'],
    firstEligible: '3',
    secondEligible: '1',
    nonPassCount: 0,
    zoneTokenCounts: [
      { zone: 'available-VC:none', faction: 'VC', type: 'guerrilla', count: 11 },
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 3 },
      { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 7 },
      { zone: 'out-of-play-US:none', faction: 'US', type: 'troops', count: 4 },
      { zone: 'out-of-play-US:none', faction: 'US', type: 'base', count: 2 },
      { zone: 'kien-phong:none', faction: 'NVA', type: 'guerrilla', count: 3 },
      { zone: 'kien-giang-an-xuyen:none', faction: 'NVA', type: 'guerrilla', count: 4 },
      { zone: 'kien-giang-an-xuyen:none', faction: 'VC', type: 'guerrilla', count: 0 },
      { zone: 'southern-laos:none', faction: 'NVA', type: 'troops', count: 5 },
      { zone: 'southern-laos:none', faction: 'NVA', type: 'guerrilla', count: 0 },
    ],
    markers: [
      { space: 'quang-tri-thua-thien:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
      { space: 'kien-giang-an-xuyen:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
      { space: 'kien-phong:none', marker: 'supportOpposition', expected: 'activeOpposition' },
    ],
    computedValues: [
      { label: 'pending free-operation grants', expected: 0, compute: (_def, state) =>
        state.turnOrderState.type === 'cardDriven'
          ? (state.turnOrderState.runtime.pendingFreeOperationGrants ?? []).length
          : 0 },
      { label: 'VC victory marker', expected: 23, compute: computeVcVictory },
    ],
  },
};

// Turn 5 — Brinks Hotel (card-97)
// Seat order: VC, US, ARVN, NVA → seats [3, 0, 1, 2]
// Move 1: VC plays shaded Brinks Hotel event
//   - Target $targetCity auto-resolves to Hue (only city with VC presence)
//   - Shifts Hue supportOpposition by -2 (neutral → activeOpposition)
//   - Adds terrorCount +1 at Hue, terrorSabotageMarkersPlaced +1 globally
//   - VC guerrilla in Hue stays underground (event, not Terror operation)
//   - VC victory: 23 → 27 (Hue pop=2 × activeOpposition weight 2 = +4)
// Move 2: ARVN passes (+3 arvnResources → 24 → 27)
const TURN_5: PlaybookTurn = {
  label: 'Turn 5 — Brinks Hotel',
  moves: [
    {
      kind: 'resolved',
      label: 'VC shaded Brinks Hotel',
      move: {
        actionId: asActionId('event'),
        params: { eventCardId: 'card-97', side: 'shaded' },
      },
      expectedState: {
        globalVars: {
          terrorSabotageMarkersPlaced: 1,
          nvaResources: 2,
          trail: 1,
          vcResources: 10,
          arvnResources: 24,
          aid: 14,
          patronage: 15,
        },
        zoneTokenCounts: [
          { zone: 'hue:none', faction: 'VC', type: 'guerrilla', count: 1,
            props: { activity: 'underground' } },
        ],
        markers: [
          { space: 'hue:none', marker: 'supportOpposition', expected: 'activeOpposition' },
        ],
        zoneVars: [
          { zone: 'hue:none', variable: 'terrorCount', expected: 1 },
        ],
        computedValues: [
          { label: 'VC victory marker', expected: 27, compute: computeVcVictory },
        ],
      },
    },
    {
      kind: 'simple',
      label: 'ARVN passes',
      move: {
        actionId: asActionId('pass'),
        params: {},
      },
    },
  ],
  expectedEndState: {
    globalVars: {
      nvaResources: 2,
      trail: 1,
      vcResources: 10,
      arvnResources: 27,
      aid: 14,
      patronage: 15,
    },
    eligibility: { '0': true, '1': true, '2': true, '3': false },
    activePlayer: 1,
    currentCard: 'card-79',
    previewCard: 'card-101',
    deckSize: 6,
    seatOrder: ['1', '2', '3', '0'],
    firstEligible: '1',
    secondEligible: '2',
    nonPassCount: 0,
    markers: [
      { space: 'hue:none', marker: 'supportOpposition', expected: 'activeOpposition' },
    ],
    zoneVars: [
      { zone: 'hue:none', variable: 'terrorCount', expected: 1 },
    ],
    computedValues: [
      { label: 'VC victory marker', expected: 27, compute: computeVcVictory },
    ],
  },
};

// Turn 6 — Henry Cabot Lodge (card-79)
// Seat order: ARVN, NVA, VC, US → seats [1, 2, 3, 0]
// VC (seat 3) is ineligible from Turn 5 event.
// Move 1: ARVN Sweep + Raid (Op+SA, raid before)
//   - Raid target: Quang Tri — Ranger from Quang Nam activates, removes 2 NVA guerrillas
//   - NVA loses control of Quang Tri (pop=2 → NVA victory 10 → 8)
//   - Sweep target: Binh Dinh (2 troops from Qui Nhon, flip 2 VC guerrillas)
//     + Pleiku (6 troops from Saigon via LoC hop, flip 4 VC guerrillas)
//   - COIN control established in Pleiku (pop=1 → ARVN victory 37 → 38)
//   - Cost: 6 ARVN resources (2 spaces × 3) → 27 → 21
// Move 2: NVA passes (+1 resource → 2 → 3)
//   - NVA passed; next eligible in sequence (VC ineligible → US) becomes 2nd eligible
// Move 3: US Limited Op Assault in Pleiku
//   - US base present → 2 damage per troop → removes 2 active VC guerrillas
//   - ARVN co-assault: 6 troops in highland → floor(6/3)=2 → removes 2 active VC guerrillas
//   - ARVN co-assault cost: 3 → arvnResources 21 → 18
const createTurn6ArvnDecisionOverrides = (): readonly DecisionOverrideRule[] => [
  // ── Sweep: Binh Dinh troop movement (direct adjacency from Qui Nhon) ──
  {
    when: (request: ChoicePendingRequest) =>
      request.name === '$movingTroops@binh-dinh:none',
    value: (request: ChoicePendingRequest) =>
      request.options
        .map((option) => option.value)
        .filter((value): value is string => typeof value === 'string'),
  },
  // ── Sweep: Pleiku troop movement — no direct adjacency, use LoC hop ──
  {
    when: (request: ChoicePendingRequest) =>
      request.name === '$movingTroops@pleiku-darlac:none',
    value: [],
  },
  // ── Sweep: LoC hop selection for Pleiku — choose the Saigon-An Loc-BMT LoC ──
  {
    when: (request: ChoicePendingRequest) =>
      request.name === '$hopLocs@pleiku-darlac:none'
      && request.options.some((o) => o.value === 'loc-saigon-an-loc-ban-me-thuot:none'),
    value: ['loc-saigon-an-loc-ban-me-thuot:none'],
  },
  // ── Sweep: Troops via LoC hop — select 6 of 8 ARVN troops from Saigon ──
  // The tokensInAdjacentZones query for the LoC includes An Loc troops (2) plus
  // Saigon troops (8). We skip the first 2 (An Loc) and take 6 from Saigon.
  {
    when: (request: ChoicePendingRequest) =>
      request.name === '$movingHopTroops@pleiku-darlac:none',
    value: (request: ChoicePendingRequest) =>
      request.options
        .map((option) => option.value)
        .filter((value): value is string => typeof value === 'string')
        .slice(2, 8),
  },
  // ── Raid: select adjacent zones with Rangers → Quang Nam ──
  {
    when: (request: ChoicePendingRequest) =>
      request.name === '$raidIncomingFrom@quang-tri-thua-thien:none',
    value: ['quang-nam:none'],
  },
  // ── Raid: choose to remove insurgents ──
  {
    when: (request: ChoicePendingRequest) =>
      request.name === '$raidRemove@quang-tri-thua-thien:none',
    value: 'yes',
  },
];

const TURN_6: PlaybookTurn = {
  label: 'Turn 6 — Henry Cabot Lodge',
  moves: [
    {
      kind: 'resolved',
      label: 'ARVN Sweep + Raid (raid before)',
      move: {
        actionId: asActionId('sweep'),
        actionClass: 'operationPlusSpecialActivity',
        params: {
          targetSpaces: ['binh-dinh:none', 'pleiku-darlac:none'],
        },
        compound: {
          specialActivity: {
            actionId: asActionId('raid'),
            actionClass: 'operationPlusSpecialActivity',
            params: {
              targetSpaces: ['quang-tri-thua-thien:none'],
              '$raidIncomingFrom@quang-tri-thua-thien:none': ['quang-nam:none'],
              '$raidRemove@quang-tri-thua-thien:none': 'yes',
            },
          },
          timing: 'before',
        },
      },
      options: { overrides: createTurn6ArvnDecisionOverrides() },
      expectedState: {
        globalVars: {
          arvnResources: 21,
          nvaResources: 2,
          vcResources: 10,
          trail: 1,
          aid: 14,
          patronage: 15,
        },
        zoneTokenCounts: [
          // Raid effects: Quang Tri
          { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 5 },
          { zone: 'quang-tri-thua-thien:none', faction: 'ARVN', type: 'ranger', count: 1,
            props: { activity: 'active' } },
          // Sweep: Binh Dinh — 2 VC guerrillas flipped active
          { zone: 'binh-dinh:none', faction: 'VC', type: 'guerrilla', count: 2,
            props: { activity: 'active' } },
          { zone: 'binh-dinh:none', faction: 'ARVN', type: 'troops', count: 2 },
          // Sweep: Pleiku — 4 VC guerrillas flipped active, 6 ARVN troops arrived
          { zone: 'pleiku-darlac:none', faction: 'VC', type: 'guerrilla', count: 4,
            props: { activity: 'active' } },
          { zone: 'pleiku-darlac:none', faction: 'ARVN', type: 'troops', count: 6 },
          // Saigon: 2 ARVN troops remain (8 - 6)
          { zone: 'saigon:none', faction: 'ARVN', type: 'troops', count: 2 },
          // Quang Nam: Ranger moved out
          { zone: 'quang-nam:none', faction: 'ARVN', type: 'ranger', count: 0 },
          // Qui Nhon: troops moved out
          { zone: 'qui-nhon:none', faction: 'ARVN', type: 'troops', count: 0 },
        ],
        computedValues: [
          { label: 'NVA victory marker', expected: 8, compute: computeNvaVictory },
          { label: 'ARVN victory marker', expected: 38, compute: computeArvnVictory },
          { label: 'VC victory marker', expected: 27, compute: computeVcVictory },
        ],
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
      label: 'US Limited Op Assault in Pleiku',
      move: {
        actionId: asActionId('assault'),
        actionClass: 'limitedOperation',
        params: {
          targetSpaces: ['pleiku-darlac:none'],
          $arvnFollowupSpaces: ['pleiku-darlac:none'],
        },
      },
      expectedState: {
        globalVars: {
          arvnResources: 18,
          nvaResources: 3,
          vcResources: 10,
          trail: 1,
          aid: 14,
          patronage: 15,
        },
        zoneTokenCounts: [
          // After US assault (2 removed) + ARVN co-assault (2 removed): 0 VC guerrillas
          { zone: 'pleiku-darlac:none', faction: 'VC', type: 'guerrilla', count: 0 },
          { zone: 'pleiku-darlac:none', faction: 'VC', type: 'base', count: 1 },
          { zone: 'pleiku-darlac:none', faction: 'ARVN', type: 'troops', count: 6 },
          { zone: 'pleiku-darlac:none', faction: 'US', type: 'troops', count: 1 },
        ],
      },
    },
  ],
  expectedEndState: {
    globalVars: {
      arvnResources: 18,
      nvaResources: 3,
      vcResources: 10,
      trail: 1,
      aid: 14,
      patronage: 15,
    },
    eligibility: { '0': false, '1': false, '2': true, '3': true },
    activePlayer: 3,
    currentCard: 'card-101',
    previewCard: 'card-125',
    deckSize: 5,
    seatOrder: ['3', '2', '0', '1'],
    firstEligible: '3',
    secondEligible: '2',
    nonPassCount: 0,
    zoneTokenCounts: [
      // Quang Tri: NVA lost control (5 NVA vs 7 others)
      { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 5 },
      { zone: 'quang-tri-thua-thien:none', faction: 'ARVN', type: 'ranger', count: 1,
        props: { activity: 'active' } },
      // Binh Dinh: 2 VC guerrillas activated by sweep
      { zone: 'binh-dinh:none', faction: 'VC', type: 'guerrilla', count: 2,
        props: { activity: 'active' } },
      { zone: 'binh-dinh:none', faction: 'ARVN', type: 'troops', count: 2 },
      // Pleiku: all VC guerrillas removed by assault, base remains
      { zone: 'pleiku-darlac:none', faction: 'VC', type: 'guerrilla', count: 0 },
      { zone: 'pleiku-darlac:none', faction: 'VC', type: 'base', count: 1 },
      { zone: 'pleiku-darlac:none', faction: 'ARVN', type: 'troops', count: 6 },
      { zone: 'pleiku-darlac:none', faction: 'US', type: 'troops', count: 1 },
      // Saigon: 2 ARVN troops remain
      { zone: 'saigon:none', faction: 'ARVN', type: 'troops', count: 2 },
    ],
    computedValues: [
      { label: 'NVA victory marker', expected: 8, compute: computeNvaVictory },
      { label: 'ARVN victory marker', expected: 38, compute: computeArvnVictory },
      { label: 'VC victory marker', expected: 27, compute: computeVcVictory },
    ],
  },
};

// ---------------------------------------------------------------------------
// Playbook turns in execution order
// ---------------------------------------------------------------------------

const PLAYBOOK_TURNS: readonly PlaybookTurn[] = [TURN_1, TURN_2, TURN_3, TURN_4, TURN_5, TURN_6];

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
