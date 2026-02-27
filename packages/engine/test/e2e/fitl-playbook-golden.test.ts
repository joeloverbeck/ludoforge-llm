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
import { type DecisionOverrideRule, type ResolveDecisionParamsOptions } from '../helpers/decision-param-helpers.js';

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
      value: (request: ChoicePendingRequest) => {
        const allValues = request.options
          .map((option) => option.value)
          .filter((value): value is string => typeof value === 'string');
        const troops = allValues.filter((v) => v.includes('us-troops'));
        const bases = allValues.filter((v) => v.includes('us-bases'));
        // Narrative: "1 Base and 5 Troop cubes" — base at end sends it to Hue (index >= 2)
        return [...troops.slice(0, 5), ...bases.slice(0, 1)];
      },
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
    value: (request: ChoicePendingRequest) => {
      // Narrative: march all 5 NVA guerrillas from North Vietnam + 2 from Central Laos = 7
      // NV Rally guerrillas: IDs 206, 207 (placed Turn 2)
      // NV initial guerrillas: IDs 71, 72, 73 (1964 scenario setup)
      // CL initial guerrillas: IDs 75, 76, 77 (1964 scenario setup)
      // Must take all 5 NV + exactly 2 CL, leaving 1 CL behind
      const nvIds = /_(71|72|73|206|207)$/;
      const allValues = request.options
        .map((option) => option.value)
        .filter((value): value is string => typeof value === 'string')
        .filter((value) => !/_(204|205|85|84|83)$/.test(value));
      const nvGuerrillas = allValues.filter((v) => nvIds.test(v));
      const clGuerrillas = allValues.filter((v) => !nvIds.test(v));
      return [...nvGuerrillas, ...clGuerrillas.slice(0, 2)];
    },
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

// ---------------------------------------------------------------------------
// Turn 8 — Commitment decision overrides (Rule 6.5)
// ---------------------------------------------------------------------------
// The commitment macro (coup-process-commitment) uses chooseN / chooseOne
// decisions for troop and base deployment. Without overrides, all chooseN
// decisions default to 0 selections. The narrative specifies:
//   1 troop from Available → An Loc (VP 49→48)
//   1 troop from Binh Dinh → Qui Nhon (map-to-map)
//   1 troop from Saigon → Can Tho (map-to-map)
//   1 troop from Saigon → Cam Ranh (map-to-map)
//   0 bases moved
const createTurn8CommitmentOverrides = (
  _def: GameDef,
  state: GameState,
): ResolveDecisionParamsOptions => {
  // Build tokenId → zoneId reverse lookup for map troop identification
  const tokenZoneLookup = new Map<string, string>();
  for (const [zoneId, tokens] of Object.entries(state.zones)) {
    for (const token of tokens ?? []) {
      tokenZoneLookup.set(String(token.id), zoneId);
    }
  }

  let mapTroopDestIndex = 0;
  const mapTroopDestinations = ['qui-nhon:none', 'can-tho:none', 'cam-ranh:none'];

  // Macro expansion prefixes bind variable names with the expansion path.
  // Match on the suffix to be independent of the macro path prefix.
  const nameEndsWith = (request: ChoicePendingRequest, suffix: string): boolean =>
    request.name.endsWith(suffix);

  return {
    overrides: [
      // Select 1 US troop from available to deploy
      {
        when: (request: ChoicePendingRequest) =>
          nameEndsWith(request, 'commitTroopsFromAvailable'),
        value: (request: ChoicePendingRequest) =>
          request.options
            .map((option) => option.value)
            .filter((value): value is string => typeof value === 'string')
            .slice(0, 1),
      },
      // Deploy it to An Loc
      {
        when: (request: ChoicePendingRequest) =>
          nameEndsWith(request, 'commitTroopDestFromAvailable'),
        value: 'an-loc:none',
      },
      // Select 3 US troops from map: 1 from Binh Dinh, 2 from Saigon
      {
        when: (request: ChoicePendingRequest) =>
          nameEndsWith(request, 'commitTroopsFromMap'),
        value: (request: ChoicePendingRequest) => {
          const allTokenIds = request.options
            .map((option) => option.value)
            .filter((value): value is string => typeof value === 'string');
          const fromBinhDinh = allTokenIds.filter(
            (id) => tokenZoneLookup.get(id) === 'binh-dinh:none',
          );
          const fromSaigon = allTokenIds.filter(
            (id) => tokenZoneLookup.get(id) === 'saigon:none',
          );
          return [
            ...fromBinhDinh.slice(0, 1),
            ...fromSaigon.slice(0, 2),
          ];
        },
      },
      // All map troops move to-map (not to-available)
      {
        when: (request: ChoicePendingRequest) =>
          nameEndsWith(request, 'commitTroopMapMoveMode'),
        value: 'to-map',
      },
      // Map troop destinations in sequence: Qui Nhon, Can Tho, Cam Ranh
      {
        when: (request: ChoicePendingRequest) =>
          nameEndsWith(request, 'commitTroopDestFromMap'),
        value: () => {
          const dest = mapTroopDestinations[mapTroopDestIndex];
          mapTroopDestIndex += 1;
          return dest;
        },
      },
      // Select 0 bases (explicit empty to avoid deterministic default)
      {
        when: (request: ChoicePendingRequest) =>
          nameEndsWith(request, 'commitBasesFromAvailable'),
        value: [],
      },
      // Select 0 bases from map (explicit empty)
      {
        when: (request: ChoicePendingRequest) =>
          nameEndsWith(request, 'commitBasesFromMap'),
        value: [],
      },
    ],
  };
};

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

const FITL_SUPPORT_CONFIG: MarkerWeightConfig = {
  activeState: 'activeSupport',
  passiveState: 'passiveSupport',
};

const FITL_US_FORMULA: VictoryFormula = {
  type: 'markerTotalPlusZoneCount',
  markerConfig: FITL_SUPPORT_CONFIG,
  countZone: 'available-US:none',
  countTokenTypes: ['us-troops', 'us-bases'],
};

const computeUsVictory = (def: GameDef, state: GameState): number =>
  computeVictoryMarker(
    DERIVED_METRICS_CONTEXT,
    state,
    mapSpaces(def),
    supportOppositionBySpace(def, state),
    FITL_FACTION_CONFIG,
    FITL_US_FORMULA,
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
      expectedState: {
        globalVars: {
          aid: 3,              // 15 - 12
          arvnResources: 30,   // unchanged
          nvaResources: 10,    // unchanged
          vcResources: 5,      // events don't cost resources
          patronage: 15,       // unchanged
          trail: 1,            // unchanged
        },
        markers: [
          { space: 'saigon:none', marker: 'supportOpposition', expected: 'neutral' },
        ],
        computedValues: [
          { label: 'US victory marker after Burning Bonze', expected: 32, compute: computeUsVictory },
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
      expectedState: {
        globalVars: {
          nvaResources: 11,    // 10 + 1 Insurgent pass bonus
          aid: 3,              // unchanged from Move 1
          arvnResources: 30,   // unchanged
          vcResources: 5,      // unchanged
        },
        markers: [
          { space: 'saigon:none', marker: 'supportOpposition', expected: 'neutral' },
        ],
        computedValues: [
          { label: 'US victory marker after NVA pass', expected: 32, compute: computeUsVictory },
        ],
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
      expectedOperationState: {
        globalVars: {
          arvnResources: 24,   // 30 - 3 (Train) - 3 (Pacify)
          aid: 8,              // 3 + 5 (Minh leader bonus on Train)
          nvaResources: 11,    // unchanged
          vcResources: 5,      // unchanged
          patronage: 15,       // unchanged
        },
        zoneTokenCounts: [
          { zone: 'saigon:none', faction: 'ARVN', type: 'troops', count: 8 },  // 2 + 6 placed
          { zone: 'saigon:none', faction: 'ARVN', type: 'police', count: 3 },  // unchanged
          { zone: 'available-ARVN:none', faction: 'ARVN', type: 'troops', count: 2 }, // 8 - 6
        ],
        markers: [
          { space: 'saigon:none', marker: 'supportOpposition', expected: 'passiveSupport' },
        ],
        computedValues: [
          { label: 'US victory marker after Pacify', expected: 38, compute: computeUsVictory },
        ],
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
      // An Loc & Can Tho unchanged by Govern (Govern doesn't move pieces)
      { zone: 'an-loc:none', faction: 'ARVN', type: 'troops', count: 2 },
      { zone: 'an-loc:none', faction: 'ARVN', type: 'police', count: 2 },
      { zone: 'can-tho:none', faction: 'ARVN', type: 'troops', count: 2 },
      { zone: 'can-tho:none', faction: 'ARVN', type: 'police', count: 2 },
      // ARVN Available after 6 troops placed
      { zone: 'available-ARVN:none', faction: 'ARVN', type: 'troops', count: 2 },
    ],
    markers: [
      { space: 'saigon:none', marker: 'supportOpposition', expected: 'passiveSupport' },
    ],
    globalMarkers: [
      { marker: 'activeLeader', expected: 'minh' },
    ],
    computedValues: [
      { label: 'US victory marker', expected: 38, compute: computeUsVictory },
      { label: 'NVA victory marker', expected: 4, compute: computeNvaVictory },
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
      expectedState: {
        // Rally cost: 4 resources (1/space) + trail improvement (2) → 11 → 5
        globalVars: {
          nvaResources: 5,
          trail: 2,
          aid: 14,
          arvnResources: 24,
          vcResources: 5,
          patronage: 15,
        },
        zoneTokenCounts: [
          // NVA Rally placements — all guerrillas underground
          // North Vietnam: 3 initial + 2 placed (1 base + trail=1) = 5
          { zone: 'north-vietnam:none', faction: 'NVA', type: 'guerrilla', count: 5 },
          { zone: 'north-vietnam:none', faction: 'NVA', type: 'guerrilla', count: 5,
            props: { activity: 'underground' } },
          { zone: 'north-vietnam:none', faction: 'NVA', type: 'base', count: 1 },
          // Parrot's Beak: 3 initial + 2 placed (1 base + trail=1) = 5
          { zone: 'the-parrots-beak:none', faction: 'NVA', type: 'guerrilla', count: 5 },
          { zone: 'the-parrots-beak:none', faction: 'NVA', type: 'guerrilla', count: 5,
            props: { activity: 'underground' } },
          { zone: 'the-parrots-beak:none', faction: 'NVA', type: 'base', count: 1 },
          // Kien Phong: 0 initial + 1 placed (no base) = 1
          { zone: 'kien-phong:none', faction: 'NVA', type: 'guerrilla', count: 1 },
          { zone: 'kien-phong:none', faction: 'NVA', type: 'guerrilla', count: 1,
            props: { activity: 'underground' } },
          // Kien Giang: 0 initial + 1 placed (no base) = 1
          { zone: 'kien-giang-an-xuyen:none', faction: 'NVA', type: 'guerrilla', count: 1 },
          { zone: 'kien-giang-an-xuyen:none', faction: 'NVA', type: 'guerrilla', count: 1,
            props: { activity: 'underground' } },
          // VC pieces unchanged by NVA Rally
          { zone: 'kien-phong:none', faction: 'VC', type: 'guerrilla', count: 1 },
          { zone: 'kien-giang-an-xuyen:none', faction: 'VC', type: 'guerrilla', count: 1 },
          // Quang Tri untouched by Rally — VC base + 2 underground guerrillas
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'base', count: 1 },
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 2 },
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 2,
            props: { activity: 'underground' } },
          // US pieces in Quang Tri unchanged
          { zone: 'quang-tri-thua-thien:none', faction: 'US', type: 'troops', count: 1 },
          { zone: 'quang-tri-thua-thien:none', faction: 'US', type: 'irregular', count: 1,
            props: { activity: 'underground' } },
          // Saigon pieces unchanged from Turn 1
          { zone: 'saigon:none', faction: 'ARVN', type: 'troops', count: 8 },
          { zone: 'saigon:none', faction: 'ARVN', type: 'police', count: 3 },
          { zone: 'saigon:none', faction: 'US', type: 'troops', count: 2 },
          { zone: 'saigon:none', faction: 'US', type: 'base', count: 1 },
          // Available NVA guerrillas: 8 initial - 6 placed = 2 remaining
          { zone: 'available-NVA:none', faction: 'NVA', type: 'guerrilla', count: 2 },
        ],
        markers: [
          { space: 'saigon:none', marker: 'supportOpposition', expected: 'passiveSupport' },
        ],
        computedValues: [
          // Rally doesn't change support/opposition or control → all VPs unchanged
          { label: 'US victory marker', expected: 38, compute: computeUsVictory },
          { label: 'NVA victory marker', expected: 4, compute: computeNvaVictory },
          { label: 'VC victory marker', expected: 27, compute: computeVcVictory },
          { label: 'ARVN victory marker', expected: 35, compute: computeArvnVictory },
        ],
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
      // NVA Rally placements (all guerrillas underground — Sweep only affects Quang Tri)
      { zone: 'north-vietnam:none', faction: 'NVA', type: 'guerrilla', count: 5 },
      { zone: 'north-vietnam:none', faction: 'NVA', type: 'guerrilla', count: 5,
        props: { activity: 'underground' } },
      { zone: 'north-vietnam:none', faction: 'NVA', type: 'base', count: 1 },
      { zone: 'the-parrots-beak:none', faction: 'NVA', type: 'guerrilla', count: 5 },
      { zone: 'the-parrots-beak:none', faction: 'NVA', type: 'guerrilla', count: 5,
        props: { activity: 'underground' } },
      { zone: 'the-parrots-beak:none', faction: 'NVA', type: 'base', count: 1 },
      { zone: 'kien-phong:none', faction: 'NVA', type: 'guerrilla', count: 1 },
      { zone: 'kien-giang-an-xuyen:none', faction: 'NVA', type: 'guerrilla', count: 1 },
      // VC pieces in provinces unchanged
      { zone: 'kien-phong:none', faction: 'VC', type: 'guerrilla', count: 1 },
      { zone: 'kien-giang-an-xuyen:none', faction: 'VC', type: 'guerrilla', count: 1 },
      // CRITICAL: VC base in Quang Tri remains — Sweep does NOT remove bases
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'base', count: 1 },
      // VC guerrillas in Quang Tri activated by Sweep (2 sweepers flip 2 underground)
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 2,
        props: { activity: 'active' } },
      // No underground VC guerrillas remain in Quang Tri
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 0,
        props: { activity: 'underground' } },
      // US pieces in Quang Tri unchanged by Sweep
      { zone: 'quang-tri-thua-thien:none', faction: 'US', type: 'troops', count: 1 },
      { zone: 'quang-tri-thua-thien:none', faction: 'US', type: 'irregular', count: 1,
        props: { activity: 'underground' } },
      // Saigon pieces unchanged from Turn 1
      { zone: 'saigon:none', faction: 'ARVN', type: 'troops', count: 8 },
      { zone: 'saigon:none', faction: 'ARVN', type: 'police', count: 3 },
      { zone: 'saigon:none', faction: 'US', type: 'troops', count: 2 },
      { zone: 'saigon:none', faction: 'US', type: 'base', count: 1 },
      // Available pieces after Rally placements
      { zone: 'available-NVA:none', faction: 'NVA', type: 'guerrilla', count: 2 },
      { zone: 'available-VC:none', faction: 'VC', type: 'guerrilla', count: 14 },
    ],
    markers: [
      { space: 'saigon:none', marker: 'supportOpposition', expected: 'passiveSupport' },
    ],
    globalMarkers: [
      { marker: 'activeLeader', expected: 'minh' },
    ],
    computedValues: [
      // Sweep doesn't change support/opposition or control → all VPs unchanged
      { label: 'US victory marker', expected: 38, compute: computeUsVictory },
      { label: 'NVA victory marker', expected: 4, compute: computeNvaVictory },
      { label: 'VC victory marker', expected: 27, compute: computeVcVictory },
      { label: 'ARVN victory marker', expected: 35, compute: computeArvnVictory },
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
          nvaResources: 5,
          vcResources: 5,
          trail: 2,
        },
        zoneTokenCounts: [
          // 3 irregulars placed from available-US:none + 1 initial = 4 total
          { zone: 'binh-dinh:none', faction: 'US', type: 'irregular', count: 4 },
          // All placed irregulars are underground per playbook
          { zone: 'binh-dinh:none', faction: 'US', type: 'irregular', count: 4,
            props: { activity: 'underground' } },
          { zone: 'available-US:none', faction: 'US', type: 'irregular', count: 0 },
          // Binh Dinh VC pieces unchanged (validates COIN control count)
          { zone: 'binh-dinh:none', faction: 'VC', type: 'guerrilla', count: 2 },
          { zone: 'binh-dinh:none', faction: 'VC', type: 'base', count: 1 },
        ],
        totalTokenCounts: [
          { faction: 'US', type: 'irregular', count: 6 },
        ],
        markers: [
          { space: 'binh-dinh:none', marker: 'supportOpposition', expected: 'activeSupport' },
          { space: 'saigon:none', marker: 'supportOpposition', expected: 'passiveSupport' },
        ],
        computedValues: [
          { label: 'US VP after Green Berets', expected: 42, compute: computeUsVictory },
          { label: 'ARVN VP after COIN Control gained', expected: 37, compute: computeArvnVictory },
          { label: 'NVA VP unchanged', expected: 4, compute: computeNvaVictory },
          { label: 'VC VP unchanged', expected: 27, compute: computeVcVictory },
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
          // Pleiku: 2 initial underground + 2 Rally underground = 4 underground
          { zone: 'pleiku-darlac:none', faction: 'VC', type: 'guerrilla', count: 4 },
          { zone: 'pleiku-darlac:none', faction: 'VC', type: 'guerrilla', count: 4,
            props: { activity: 'underground' } },
          // Quang Tri: 2 active (Turn 2 Sweep) + 3 Rally underground = 5 total
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 5 },
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 2,
            props: { activity: 'active' } },
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 3,
            props: { activity: 'underground' } },
          // Hue: 1 Rally underground
          { zone: 'hue:none', faction: 'VC', type: 'guerrilla', count: 1 },
          { zone: 'hue:none', faction: 'VC', type: 'guerrilla', count: 1,
            props: { activity: 'underground' } },
          // Tax spaces pre-Tax (all underground, 0 active)
          { zone: 'quang-tin-quang-ngai:none', faction: 'VC', type: 'guerrilla',
            count: 0, props: { activity: 'active' } },
          { zone: 'quang-duc-long-khanh:none', faction: 'VC', type: 'guerrilla',
            count: 0, props: { activity: 'active' } },
          { zone: 'binh-tuy-binh-thuan:none', faction: 'VC', type: 'guerrilla',
            count: 0, props: { activity: 'active' } },
          // Available VC guerrillas after Rally placement (14 - 6 = 8)
          { zone: 'available-VC:none', faction: 'VC', type: 'guerrilla', count: 8 },
        ],
        totalTokenCounts: [
          { faction: 'VC', type: 'guerrilla', count: 30 },
        ],
        markers: [
          { space: 'quang-tin-quang-ngai:none', marker: 'supportOpposition', expected: 'activeOpposition' },
          { space: 'quang-duc-long-khanh:none', marker: 'supportOpposition', expected: 'activeOpposition' },
          { space: 'binh-tuy-binh-thuan:none', marker: 'supportOpposition', expected: 'activeOpposition' },
        ],
        computedValues: [
          { label: 'US VP unchanged after Rally', expected: 42, compute: computeUsVictory },
          { label: 'ARVN VP unchanged after Rally', expected: 37, compute: computeArvnVictory },
          { label: 'NVA VP unchanged after Rally', expected: 4, compute: computeNvaVictory },
          { label: 'VC VP unchanged after Rally', expected: 27, compute: computeVcVictory },
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
      { zone: 'binh-dinh:none', faction: 'US', type: 'irregular', count: 4,
        props: { activity: 'underground' } },
      { zone: 'available-US:none', faction: 'US', type: 'irregular', count: 0 },
      // VC Rally placements (underground)
      { zone: 'pleiku-darlac:none', faction: 'VC', type: 'guerrilla', count: 4 },
      { zone: 'pleiku-darlac:none', faction: 'VC', type: 'guerrilla', count: 4,
        props: { activity: 'underground' } },
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 5 },
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 2,
        props: { activity: 'active' } },
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 3,
        props: { activity: 'underground' } },
      { zone: 'hue:none', faction: 'VC', type: 'guerrilla', count: 1 },
      { zone: 'hue:none', faction: 'VC', type: 'guerrilla', count: 1,
        props: { activity: 'underground' } },
      // Tax flipped guerrillas (1 active per space)
      { zone: 'quang-tin-quang-ngai:none', faction: 'VC', type: 'guerrilla',
        count: 1, props: { activity: 'active' } },
      { zone: 'quang-duc-long-khanh:none', faction: 'VC', type: 'guerrilla',
        count: 1, props: { activity: 'active' } },
      { zone: 'binh-tuy-binh-thuan:none', faction: 'VC', type: 'guerrilla',
        count: 1, props: { activity: 'active' } },
      // Available piece counts
      { zone: 'available-VC:none', faction: 'VC', type: 'guerrilla', count: 8 },
      { zone: 'available-NVA:none', faction: 'NVA', type: 'guerrilla', count: 2 },
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
    globalMarkers: [
      { marker: 'activeLeader', expected: 'minh' },
    ],
    computedValues: [
      { label: 'US victory marker', expected: 42, compute: computeUsVictory },
      { label: 'ARVN victory marker', expected: 37, compute: computeArvnVictory },
      { label: 'NVA victory marker', expected: 4, compute: computeNvaVictory },
      { label: 'VC victory marker', expected: 23, compute: computeVcVictory },
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
      optionsFactory: () => ({
        overrides: createTurn4EventDecisionOverrides(),
      }),
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
          { label: 'VC victory marker unchanged', expected: 23, compute: computeVcVictory },
          { label: 'NVA victory marker unchanged', expected: 4, compute: computeNvaVictory },
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
          // Quang Tri after Air Strike: 2 active VC removed, 3 underground remain
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 3 },
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 0,
            props: { activity: 'active' } },
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 3,
            props: { activity: 'underground' } },
          // VC base survives Air Strike
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'base', count: 1 },
          // US pieces in Quang Tri unchanged by Air Strike
          { zone: 'quang-tri-thua-thien:none', faction: 'US', type: 'troops', count: 1 },
          { zone: 'quang-tri-thua-thien:none', faction: 'US', type: 'irregular', count: 1,
            props: { activity: 'underground' } },
          // Available VC guerrillas: 8 (Turn 3) + 2 removed = 10
          { zone: 'available-VC:none', faction: 'VC', type: 'guerrilla', count: 10 },
          // OoP after deployment: 10-5 troops, 2-1 bases
          { zone: 'out-of-play-US:none', faction: 'US', type: 'troops', count: 5 },
          { zone: 'out-of-play-US:none', faction: 'US', type: 'base', count: 1 },
          // Deployment targets: 2 troops to Saigon (2+2=4), 3 troops + 1 base to Hue
          { zone: 'saigon:none', faction: 'US', type: 'troops', count: 4 },
          { zone: 'hue:none', faction: 'US', type: 'troops', count: 3 },
          { zone: 'hue:none', faction: 'US', type: 'base', count: 1 },
        ],
        markers: [
          { space: 'quang-tri-thua-thien:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
        ],
        computedValues: [
          { label: 'VC victory marker', expected: 25, compute: computeVcVictory },
          { label: 'US victory marker unchanged', expected: 42, compute: computeUsVictory },
          { label: 'ARVN victory marker unchanged', expected: 37, compute: computeArvnVictory },
          { label: 'NVA victory marker unchanged', expected: 4, compute: computeNvaVictory },
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
      expectedOperationState: {
        globalVars: {
          nvaResources: 2,
          trail: 1,
          vcResources: 10,
          arvnResources: 24,
          aid: 14,
          patronage: 15,
        },
        zoneTokenCounts: [
          // March destinations — all guerrillas arrive underground
          { zone: 'kien-phong:none', faction: 'NVA', type: 'guerrilla', count: 3 },
          { zone: 'kien-phong:none', faction: 'NVA', type: 'guerrilla', count: 3,
            props: { activity: 'underground' } },
          { zone: 'kien-giang-an-xuyen:none', faction: 'NVA', type: 'guerrilla', count: 3 },
          { zone: 'kien-giang-an-xuyen:none', faction: 'NVA', type: 'guerrilla', count: 3,
            props: { activity: 'underground' } },
          { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 7 },
          { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 7,
            props: { activity: 'underground' } },
          // Source zone departures
          { zone: 'the-parrots-beak:none', faction: 'NVA', type: 'guerrilla', count: 1 },
          { zone: 'north-vietnam:none', faction: 'NVA', type: 'guerrilla', count: 0 },
          { zone: 'north-vietnam:none', faction: 'NVA', type: 'base', count: 1 },
          { zone: 'central-laos:none', faction: 'NVA', type: 'guerrilla', count: 1 },
          { zone: 'central-laos:none', faction: 'NVA', type: 'base', count: 1 },
          // Unchanged zones
          { zone: 'southern-laos:none', faction: 'NVA', type: 'guerrilla', count: 3 },
          { zone: 'southern-laos:none', faction: 'NVA', type: 'base', count: 1 },
          { zone: 'kien-phong:none', faction: 'VC', type: 'guerrilla', count: 1 },
          { zone: 'kien-giang-an-xuyen:none', faction: 'VC', type: 'guerrilla', count: 1 },
        ],
        computedValues: [
          { label: 'NVA victory marker', expected: 10, compute: computeNvaVictory },
          { label: 'VC victory marker unchanged', expected: 25, compute: computeVcVictory },
          { label: 'US victory marker unchanged', expected: 42, compute: computeUsVictory },
          { label: 'ARVN victory marker unchanged', expected: 37, compute: computeArvnVictory },
        ],
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
          // March + Infiltrate final positions
          { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 7 },
          { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 7,
            props: { activity: 'underground' } },
          { zone: 'kien-phong:none', faction: 'NVA', type: 'guerrilla', count: 3 },
          { zone: 'kien-phong:none', faction: 'NVA', type: 'guerrilla', count: 3,
            props: { activity: 'underground' } },
          { zone: 'kien-giang-an-xuyen:none', faction: 'NVA', type: 'guerrilla', count: 4 },
          { zone: 'kien-giang-an-xuyen:none', faction: 'VC', type: 'guerrilla', count: 0 },
          // Infiltrate build-up: Southern Laos guerrillas replaced by NVA troops
          { zone: 'southern-laos:none', faction: 'NVA', type: 'troops', count: 5 },
          { zone: 'southern-laos:none', faction: 'NVA', type: 'guerrilla', count: 0 },
          { zone: 'southern-laos:none', faction: 'NVA', type: 'base', count: 1 },
          // Source zone departures persisted
          { zone: 'the-parrots-beak:none', faction: 'NVA', type: 'guerrilla', count: 1 },
          { zone: 'north-vietnam:none', faction: 'NVA', type: 'guerrilla', count: 0 },
          { zone: 'north-vietnam:none', faction: 'NVA', type: 'base', count: 1 },
          { zone: 'central-laos:none', faction: 'NVA', type: 'guerrilla', count: 1 },
          { zone: 'central-laos:none', faction: 'NVA', type: 'base', count: 1 },
          // VC guerrilla in Kien Phong NOT replaced by Infiltrate (2 space max)
          { zone: 'kien-phong:none', faction: 'VC', type: 'guerrilla', count: 1 },
        ],
        markers: [
          { space: 'kien-giang-an-xuyen:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
        ],
        computedValues: [
          { label: 'VC victory marker', expected: 23, compute: computeVcVictory },
          { label: 'NVA victory marker', expected: 10, compute: computeNvaVictory },
          { label: 'US victory marker unchanged', expected: 42, compute: computeUsVictory },
          { label: 'ARVN victory marker unchanged', expected: 37, compute: computeArvnVictory },
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
      // Quang Tri: 3 VC guerrillas (underground), 7 NVA guerrillas (underground)
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 3 },
      { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 7 },
      { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 7,
        props: { activity: 'underground' } },
      // VC base in Quang Tri survives all Turn 4 actions
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'base', count: 1 },
      // OoP after Gulf of Tonkin deployment: 5 troops, 1 base
      { zone: 'out-of-play-US:none', faction: 'US', type: 'troops', count: 5 },
      { zone: 'out-of-play-US:none', faction: 'US', type: 'base', count: 1 },
      // US deployment targets from Gulf of Tonkin event
      { zone: 'saigon:none', faction: 'US', type: 'troops', count: 4 },
      { zone: 'hue:none', faction: 'US', type: 'troops', count: 3 },
      { zone: 'hue:none', faction: 'US', type: 'base', count: 1 },
      // NVA March destinations
      { zone: 'kien-phong:none', faction: 'NVA', type: 'guerrilla', count: 3 },
      { zone: 'kien-giang-an-xuyen:none', faction: 'NVA', type: 'guerrilla', count: 4 },
      { zone: 'kien-giang-an-xuyen:none', faction: 'VC', type: 'guerrilla', count: 0 },
      // Infiltrate build-up: Southern Laos
      { zone: 'southern-laos:none', faction: 'NVA', type: 'troops', count: 5 },
      { zone: 'southern-laos:none', faction: 'NVA', type: 'guerrilla', count: 0 },
      { zone: 'southern-laos:none', faction: 'NVA', type: 'base', count: 1 },
      // NVA bases in source zones persist
      { zone: 'north-vietnam:none', faction: 'NVA', type: 'base', count: 1 },
      { zone: 'north-vietnam:none', faction: 'NVA', type: 'guerrilla', count: 0 },
      // Source zone residuals
      { zone: 'the-parrots-beak:none', faction: 'NVA', type: 'guerrilla', count: 1 },
      { zone: 'central-laos:none', faction: 'NVA', type: 'guerrilla', count: 1 },
      // VC guerrilla in Kien Phong persists (not replaced by Infiltrate)
      { zone: 'kien-phong:none', faction: 'VC', type: 'guerrilla', count: 1 },
    ],
    markers: [
      { space: 'quang-tri-thua-thien:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
      { space: 'kien-giang-an-xuyen:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
      { space: 'kien-phong:none', marker: 'supportOpposition', expected: 'activeOpposition' },
    ],
    globalMarkers: [
      { marker: 'activeLeader', expected: 'minh' },
    ],
    computedValues: [
      { label: 'pending free-operation grants', expected: 0, compute: (_def, state) =>
        state.turnOrderState.type === 'cardDriven'
          ? (state.turnOrderState.runtime.pendingFreeOperationGrants ?? []).length
          : 0 },
      { label: 'VC victory marker', expected: 23, compute: computeVcVictory },
      { label: 'NVA victory marker', expected: 10, compute: computeNvaVictory },
      { label: 'US victory marker', expected: 42, compute: computeUsVictory },
      { label: 'ARVN victory marker', expected: 37, compute: computeArvnVictory },
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
          infiltrateCount: 1,
          nvaResources: 2,
          trail: 1,
          vcResources: 10,
          arvnResources: 24,
          aid: 14,
          patronage: 15,
        },
        zoneTokenCounts: [
          // VC guerrilla in Hue stays underground (event, not Terror operation)
          { zone: 'hue:none', faction: 'VC', type: 'guerrilla', count: 1 },
          { zone: 'hue:none', faction: 'VC', type: 'guerrilla', count: 1,
            props: { activity: 'underground' } },
          // Hue COIN persistence — Control unaffected by Terror
          { zone: 'hue:none', faction: 'US', type: 'troops', count: 3 },
          { zone: 'hue:none', faction: 'US', type: 'base', count: 1 },
        ],
        markers: [
          { space: 'hue:none', marker: 'supportOpposition', expected: 'activeOpposition' },
          // Marker persistence from prior turns
          { space: 'quang-tri-thua-thien:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
          { space: 'kien-phong:none', marker: 'supportOpposition', expected: 'activeOpposition' },
          { space: 'kien-giang-an-xuyen:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
        ],
        globalMarkers: [
          { marker: 'activeLeader', expected: 'minh' },
        ],
        zoneVars: [
          { zone: 'hue:none', variable: 'terrorCount', expected: 1 },
        ],
        computedValues: [
          { label: 'VC victory marker', expected: 27, compute: computeVcVictory },
          { label: 'NVA victory marker', expected: 10, compute: computeNvaVictory },
          { label: 'US victory marker', expected: 42, compute: computeUsVictory },
          { label: 'ARVN victory marker', expected: 37, compute: computeArvnVictory },
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
      expectedState: {
        globalVars: {
          arvnResources: 27,
          vcResources: 10,
          nvaResources: 2,
        },
      },
    },
  ],
  expectedEndState: {
    globalVars: {
      nvaResources: 2,
      trail: 1,
      infiltrateCount: 1,
      terrorSabotageMarkersPlaced: 1,
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
    zoneTokenCounts: [
      // Board persistence — Turn 5 moves no tokens
      { zone: 'available-VC:none', faction: 'VC', type: 'guerrilla', count: 11 },
      // Quang Tri: 3 VC guerrillas, 7 NVA guerrillas (underground), VC base
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 3 },
      { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 7 },
      { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 7,
        props: { activity: 'underground' } },
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'base', count: 1 },
      // Hue: US troops=3, US base=1, VC guerrilla=1 (underground)
      { zone: 'hue:none', faction: 'US', type: 'troops', count: 3 },
      { zone: 'hue:none', faction: 'US', type: 'base', count: 1 },
      { zone: 'hue:none', faction: 'VC', type: 'guerrilla', count: 1 },
      { zone: 'hue:none', faction: 'VC', type: 'guerrilla', count: 1,
        props: { activity: 'underground' } },
      // Out-of-play US: 5 troops, 1 base
      { zone: 'out-of-play-US:none', faction: 'US', type: 'troops', count: 5 },
      { zone: 'out-of-play-US:none', faction: 'US', type: 'base', count: 1 },
      // Saigon: US troops=4
      { zone: 'saigon:none', faction: 'US', type: 'troops', count: 4 },
      // Kien Phong: NVA guerrillas=3, VC guerrilla=1
      { zone: 'kien-phong:none', faction: 'NVA', type: 'guerrilla', count: 3 },
      { zone: 'kien-phong:none', faction: 'VC', type: 'guerrilla', count: 1 },
      // Kien Giang An Xuyen: NVA guerrillas=4, VC guerrillas=0
      { zone: 'kien-giang-an-xuyen:none', faction: 'NVA', type: 'guerrilla', count: 4 },
      { zone: 'kien-giang-an-xuyen:none', faction: 'VC', type: 'guerrilla', count: 0 },
      // Southern Laos: NVA troops=5, NVA guerrillas=0, NVA base=1
      { zone: 'southern-laos:none', faction: 'NVA', type: 'troops', count: 5 },
      { zone: 'southern-laos:none', faction: 'NVA', type: 'guerrilla', count: 0 },
      { zone: 'southern-laos:none', faction: 'NVA', type: 'base', count: 1 },
      // North Vietnam: NVA base=1, NVA guerrillas=0
      { zone: 'north-vietnam:none', faction: 'NVA', type: 'base', count: 1 },
      { zone: 'north-vietnam:none', faction: 'NVA', type: 'guerrilla', count: 0 },
      // Source zone residuals
      { zone: 'the-parrots-beak:none', faction: 'NVA', type: 'guerrilla', count: 1 },
      { zone: 'central-laos:none', faction: 'NVA', type: 'guerrilla', count: 1 },
    ],
    markers: [
      { space: 'hue:none', marker: 'supportOpposition', expected: 'activeOpposition' },
      // Marker persistence from prior turns
      { space: 'quang-tri-thua-thien:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
      { space: 'kien-phong:none', marker: 'supportOpposition', expected: 'activeOpposition' },
      { space: 'kien-giang-an-xuyen:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
    ],
    globalMarkers: [
      { marker: 'activeLeader', expected: 'minh' },
    ],
    zoneVars: [
      { zone: 'hue:none', variable: 'terrorCount', expected: 1 },
    ],
    computedValues: [
      { label: 'pending free-operation grants', expected: 0, compute: (_def, state) =>
        state.turnOrderState.type === 'cardDriven'
          ? (state.turnOrderState.runtime.pendingFreeOperationGrants ?? []).length
          : 0 },
      { label: 'VC victory marker', expected: 27, compute: computeVcVictory },
      { label: 'NVA victory marker', expected: 10, compute: computeNvaVictory },
      { label: 'US victory marker', expected: 42, compute: computeUsVictory },
      { label: 'ARVN victory marker', expected: 37, compute: computeArvnVictory },
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
  // Bind name is macro-hygienized: $__macro_sweep_loc_hop_..._hopLocs_pleiku-darlac:none
  {
    when: (request: ChoicePendingRequest) =>
      request.name.endsWith('hopLocs_pleiku-darlac:none')
      && request.options.some((o) => o.value === 'loc-saigon-an-loc-ban-me-thuot:none'),
    value: ['loc-saigon-an-loc-ban-me-thuot:none'],
  },
  // ── Sweep: Troops via LoC hop — select 6 of 8 ARVN troops from Saigon ──
  // The tokensInAdjacentZones query for the LoC includes An Loc troops (2) plus
  // Saigon troops (8). We skip the first 2 (An Loc) and take 6 from Saigon.
  // Bind name is macro-hygienized: $__macro_sweep_loc_hop_..._movingHopTroops_pleiku-darlac:none
  {
    when: (request: ChoicePendingRequest) =>
      request.name.endsWith('movingHopTroops_pleiku-darlac:none'),
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
          // Quang Tri: 4 VC = 3 guerrillas + 1 base (untouched by raid)
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 3 },
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'base', count: 1 },
          // Quang Tri: 2 US = 1 troop + 1 SF irregular (untouched by raid)
          { zone: 'quang-tri-thua-thien:none', faction: 'US', type: 'troops', count: 1 },
          { zone: 'quang-tri-thua-thien:none', faction: 'US', type: 'irregular', count: 1 },
          // Sweep: Binh Dinh — 2 VC guerrillas flipped active
          { zone: 'binh-dinh:none', faction: 'VC', type: 'guerrilla', count: 2,
            props: { activity: 'active' } },
          // Binh Dinh: total VC guerrillas = 2 (all active, none underground)
          { zone: 'binh-dinh:none', faction: 'VC', type: 'guerrilla', count: 2 },
          { zone: 'binh-dinh:none', faction: 'ARVN', type: 'troops', count: 2 },
          // Sweep: Pleiku — 4 VC guerrillas flipped active, 6 ARVN troops arrived
          { zone: 'pleiku-darlac:none', faction: 'VC', type: 'guerrilla', count: 4,
            props: { activity: 'active' } },
          // Pleiku: total VC guerrillas = 4 (all active, none underground)
          { zone: 'pleiku-darlac:none', faction: 'VC', type: 'guerrilla', count: 4 },
          // Pleiku: 5 VC = 4 guerrillas + 1 base
          { zone: 'pleiku-darlac:none', faction: 'VC', type: 'base', count: 1 },
          { zone: 'pleiku-darlac:none', faction: 'ARVN', type: 'troops', count: 6 },
          // Pleiku: US pieces (1 troop, 1 SF irregular, 1 base) — untouched by sweep
          { zone: 'pleiku-darlac:none', faction: 'US', type: 'troops', count: 1 },
          { zone: 'pleiku-darlac:none', faction: 'US', type: 'irregular', count: 1 },
          { zone: 'pleiku-darlac:none', faction: 'US', type: 'base', count: 1 },
          // Saigon: 2 ARVN troops remain (8 - 6)
          { zone: 'saigon:none', faction: 'ARVN', type: 'troops', count: 2 },
          // Quang Nam: Ranger moved out
          { zone: 'quang-nam:none', faction: 'ARVN', type: 'ranger', count: 0 },
          // Qui Nhon: troops moved out
          { zone: 'qui-nhon:none', faction: 'ARVN', type: 'troops', count: 0 },
        ],
        markers: [
          // Quang Tri: passive opposition persists from Turn 4
          { space: 'quang-tri-thua-thien:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
        ],
        computedValues: [
          { label: 'NVA victory marker', expected: 8, compute: computeNvaVictory },
          { label: 'ARVN victory marker', expected: 38, compute: computeArvnVictory },
          { label: 'VC victory marker', expected: 27, compute: computeVcVictory },
          { label: 'US victory marker', expected: 42, compute: computeUsVictory },
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
      expectedState: {
        globalVars: {
          nvaResources: 3,
          arvnResources: 21,
        },
        computedValues: [
          { label: 'NVA victory marker', expected: 8, compute: computeNvaVictory },
          { label: 'ARVN victory marker', expected: 38, compute: computeArvnVictory },
          { label: 'VC victory marker', expected: 27, compute: computeVcVictory },
          { label: 'US victory marker', expected: 42, compute: computeUsVictory },
        ],
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
          // US SF irregular cannot participate in assault — still present
          { zone: 'pleiku-darlac:none', faction: 'US', type: 'irregular', count: 1 },
          // US base grants bonus but is not consumed
          { zone: 'pleiku-darlac:none', faction: 'US', type: 'base', count: 1 },
        ],
        computedValues: [
          { label: 'NVA victory marker', expected: 8, compute: computeNvaVictory },
          { label: 'ARVN victory marker', expected: 38, compute: computeArvnVictory },
          { label: 'VC victory marker', expected: 27, compute: computeVcVictory },
          { label: 'US victory marker', expected: 42, compute: computeUsVictory },
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
      // Persistence from Turn 4
      infiltrateCount: 1,
      // Persistence from Turn 5
      terrorSabotageMarkersPlaced: 1,
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
      // ── Available boxes ──
      // VC available: was 11, +4 removed from Pleiku by US + ARVN assaults
      { zone: 'available-VC:none', faction: 'VC', type: 'guerrilla', count: 15 },
      // NVA available: was 4 after Turn 4 Infiltrate (+2 net), +2 from Quang Tri raid
      { zone: 'available-NVA:none', faction: 'NVA', type: 'guerrilla', count: 6 },
      // ── Quang Tri: NVA lost control (5 NVA vs 7 others) ──
      { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 5 },
      { zone: 'quang-tri-thua-thien:none', faction: 'ARVN', type: 'ranger', count: 1,
        props: { activity: 'active' } },
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 3 },
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'base', count: 1 },
      { zone: 'quang-tri-thua-thien:none', faction: 'US', type: 'troops', count: 1 },
      { zone: 'quang-tri-thua-thien:none', faction: 'US', type: 'irregular', count: 1 },
      // ── Binh Dinh: 2 VC guerrillas activated by sweep ──
      { zone: 'binh-dinh:none', faction: 'VC', type: 'guerrilla', count: 2,
        props: { activity: 'active' } },
      { zone: 'binh-dinh:none', faction: 'VC', type: 'guerrilla', count: 2 },
      { zone: 'binh-dinh:none', faction: 'ARVN', type: 'troops', count: 2 },
      // ── Pleiku: all VC guerrillas removed by assault, base remains ──
      { zone: 'pleiku-darlac:none', faction: 'VC', type: 'guerrilla', count: 0 },
      { zone: 'pleiku-darlac:none', faction: 'VC', type: 'base', count: 1 },
      { zone: 'pleiku-darlac:none', faction: 'ARVN', type: 'troops', count: 6 },
      { zone: 'pleiku-darlac:none', faction: 'US', type: 'troops', count: 1 },
      { zone: 'pleiku-darlac:none', faction: 'US', type: 'irregular', count: 1 },
      { zone: 'pleiku-darlac:none', faction: 'US', type: 'base', count: 1 },
      // ── Saigon: 2 ARVN troops remain, US troops unchanged ──
      { zone: 'saigon:none', faction: 'ARVN', type: 'troops', count: 2 },
      { zone: 'saigon:none', faction: 'US', type: 'troops', count: 4 },
      // ── Quang Nam: Ranger moved out ──
      { zone: 'quang-nam:none', faction: 'ARVN', type: 'ranger', count: 0 },
      // ── Qui Nhon: troops moved out ──
      { zone: 'qui-nhon:none', faction: 'ARVN', type: 'troops', count: 0 },
      // ── Hue: board persistence from prior turns ──
      { zone: 'hue:none', faction: 'US', type: 'troops', count: 3 },
      { zone: 'hue:none', faction: 'US', type: 'base', count: 1 },
      { zone: 'hue:none', faction: 'VC', type: 'guerrilla', count: 1 },
      { zone: 'hue:none', faction: 'VC', type: 'guerrilla', count: 1,
        props: { activity: 'underground' } },
      // ── Out-of-play US: board persistence ──
      { zone: 'out-of-play-US:none', faction: 'US', type: 'troops', count: 5 },
      { zone: 'out-of-play-US:none', faction: 'US', type: 'base', count: 1 },
      // ── Kien Phong: board persistence ──
      { zone: 'kien-phong:none', faction: 'NVA', type: 'guerrilla', count: 3 },
      { zone: 'kien-phong:none', faction: 'VC', type: 'guerrilla', count: 1 },
      // ── Kien Giang An Xuyen: board persistence ──
      { zone: 'kien-giang-an-xuyen:none', faction: 'NVA', type: 'guerrilla', count: 4 },
      // ── Southern Laos: board persistence ──
      { zone: 'southern-laos:none', faction: 'NVA', type: 'troops', count: 5 },
      { zone: 'southern-laos:none', faction: 'NVA', type: 'base', count: 1 },
      // ── North Vietnam: board persistence ──
      { zone: 'north-vietnam:none', faction: 'NVA', type: 'base', count: 1 },
      // ── Source zone residuals: board persistence ──
      { zone: 'the-parrots-beak:none', faction: 'NVA', type: 'guerrilla', count: 1 },
      { zone: 'central-laos:none', faction: 'NVA', type: 'guerrilla', count: 1 },
    ],
    markers: [
      { space: 'hue:none', marker: 'supportOpposition', expected: 'activeOpposition' },
      { space: 'quang-tri-thua-thien:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
      { space: 'kien-phong:none', marker: 'supportOpposition', expected: 'activeOpposition' },
      { space: 'kien-giang-an-xuyen:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
    ],
    globalMarkers: [
      { marker: 'activeLeader', expected: 'minh' },
    ],
    zoneVars: [
      { zone: 'hue:none', variable: 'terrorCount', expected: 1 },
    ],
    computedValues: [
      { label: 'pending free-operation grants', expected: 0, compute: (_def, state) =>
        state.turnOrderState.type === 'cardDriven'
          ? (state.turnOrderState.runtime.pendingFreeOperationGrants ?? []).length
          : 0 },
      { label: 'NVA victory marker', expected: 8, compute: computeNvaVictory },
      { label: 'ARVN victory marker', expected: 38, compute: computeArvnVictory },
      { label: 'VC victory marker', expected: 27, compute: computeVcVictory },
      { label: 'US victory marker', expected: 42, compute: computeUsVictory },
    ],
  },
};

// Turn 7 — Booby Traps (card-101) — Monsoon Season
// Seat order: VC, NVA, US, ARVN → seats [3, 2, 0, 1]
// US (seat 0) and ARVN (seat 1) are ineligible from Turn 6.
// Move 1: VC plays shaded Booby Traps event
//   - Sets global marker cap_boobyTraps to shaded
//   - No resource cost, no board changes
// Move 2: NVA Attack + Ambush (Op+SA) in Quang Tri
//   - Attack pays cost: nvaResources 3 → 2
//   - Ambush replaces combat (replaceRemainingStages):
//     - Activates 1 NVA underground guerrilla in Quang Tri
//     - Removes 1 US troop to casualties-US:none (US non-base first)
const TURN_7: PlaybookTurn = {
  label: 'Turn 7 — Booby Traps',
  moves: [
    {
      kind: 'simple',
      label: 'VC shaded Booby Traps',
      move: {
        actionId: asActionId('event'),
        params: { eventCardId: 'card-101', side: 'shaded' },
      },
      expectedState: {
        globalMarkers: [
          { marker: 'cap_boobyTraps', expected: 'shaded' },
        ],
        globalVars: {
          nvaResources: 3,
          vcResources: 10,
          arvnResources: 18,
          aid: 14,
          patronage: 15,
          trail: 1,
        },
      },
    },
    {
      kind: 'resolved',
      label: 'NVA Attack + Ambush in Quang Tri',
      move: {
        actionId: asActionId('attack'),
        actionClass: 'operationPlusSpecialActivity',
        params: {
          targetSpaces: ['quang-tri-thua-thien:none'],
        },
        compound: {
          specialActivity: {
            actionId: asActionId('ambushNva'),
            actionClass: 'operationPlusSpecialActivity',
            params: {
              targetSpaces: ['quang-tri-thua-thien:none'],
            },
          },
          timing: 'during',
          insertAfterStage: 1,
          replaceRemainingStages: true,
        },
      },
      expectedState: {
        globalVars: {
          nvaResources: 2,
          vcResources: 10,
          arvnResources: 18,
          aid: 14,
          patronage: 15,
          trail: 1,
        },
        zoneTokenCounts: [
          // Quang Tri after Ambush: 1 NVA guerrilla flipped active
          { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 5 },
          { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 1,
            props: { activity: 'active' } },
          { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 4,
            props: { activity: 'underground' } },
          // US troop removed to casualties
          { zone: 'quang-tri-thua-thien:none', faction: 'US', type: 'troops', count: 0 },
          // ARVN ranger untouched
          { zone: 'quang-tri-thua-thien:none', faction: 'ARVN', type: 'ranger', count: 1,
            props: { activity: 'active' } },
          // VC guerrillas unchanged
          { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 3 },
        ],
        globalMarkers: [
          { marker: 'cap_boobyTraps', expected: 'shaded' },
        ],
      },
    },
  ],
  expectedEndState: {
    globalVars: {
      nvaResources: 2,
      vcResources: 10,
      arvnResources: 18,
      aid: 14,
      patronage: 15,
      trail: 1,
    },
    // After the card boundary fires (coup card promoted to played),
    // advanceToDecisionPoint detects stale phase and transitions into
    // coupVictory where the coup entry reset makes all factions eligible.
    eligibility: { '0': true, '1': true, '2': true, '3': true },
    currentCard: 'card-125',
    previewCard: 'card-75',
    deckSize: 4,
    zoneTokenCounts: [
      // Quang Tri final state
      { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 5 },
      { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 1,
        props: { activity: 'active' } },
      { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 4,
        props: { activity: 'underground' } },
      { zone: 'quang-tri-thua-thien:none', faction: 'US', type: 'troops', count: 0 },
      { zone: 'quang-tri-thua-thien:none', faction: 'ARVN', type: 'ranger', count: 1,
        props: { activity: 'active' } },
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 3 },
      // Casualties: at least 1 US troop
      { zone: 'casualties-US:none', faction: 'US', type: 'troops', count: 1 },
    ],
    globalMarkers: [
      { marker: 'cap_boobyTraps', expected: 'shaded' },
    ],
    computedValues: [
      { label: 'NVA victory marker', expected: 8, compute: computeNvaVictory },
      { label: 'ARVN victory marker', expected: 38, compute: computeArvnVictory },
      { label: 'VC victory marker', expected: 27, compute: computeVcVictory },
      // Narrative Turn 8: "the US victory point token is shifted up 6 boxes from 42 to 48"
      // implies US VP = 42 at end of Turn 7.
      { label: 'US victory marker', expected: 42, compute: computeUsVictory },
    ],
  },
};

// Turn 8 — Coup! Nguyen Khanh (card-125)
// The coup card triggers a full Coup Round (Rule 6.0) with 6 phases:
//   coupVictory (6.1), coupResources (6.2), coupSupport (6.3),
//   coupRedeploy (6.4), coupCommitment (6.5), coupReset (6.6).
// At start of Turn 8, all factions are reset to eligible for each coup phase.
// Within coup phases, factions act sequentially (no card-driven 2-faction limit).
//
// Phase 6.1 — Victory Check: No faction meets victory threshold. 1 move auto-advances.
// Phase 6.2 — Resources: Macro effects compute ARVN/VC/NVA earnings, casualties-aid.
//   ARVN: 18+14(aid)+15(econ)=47, VC: 10+7(bases)=17, NVA: 2+3(bases)+2(trail×2)=7
//   Aid: 14−3(1 casualty)=11
// Phase 6.3 — Support: US Pacification (Hue, Saigon), ARVN passes, VC Agitation (4 spaces)
// Phase 6.4 — Redeploy: ARVN mandatory+police, NVA troop moves
// Phase 6.5 — Commitment: US casualty routing, troop deployment/withdrawal
// Phase 6.6 — Reset: Auto-effects (flip guerrillas, mark eligible, advance cards)
const TURN_8: PlaybookTurn = {
  label: 'Turn 8 — Coup! Nguyen Khanh',
  moves: [
    // -----------------------------------------------------------------------
    // Phase 6.1 — Victory Check
    // -----------------------------------------------------------------------
    {
      kind: 'simple',
      label: 'Victory check (no faction meets threshold)',
      move: {
        actionId: asActionId('coupVictoryCheck'),
        params: {},
      },
      // Narrative 6.1: "none of the four factions have met their victory condition thresholds"
      // Prove it: US<50, ARVN<60(?), NVA<12(?), VC<40(?) — all below.
      expectedState: {
        computedValues: [
          { label: 'US VP at victory check', expected: 42, compute: computeUsVictory },
          { label: 'ARVN VP at victory check', expected: 38, compute: computeArvnVictory },
          { label: 'NVA VP at victory check', expected: 8, compute: computeNvaVictory },
          { label: 'VC VP at victory check', expected: 27, compute: computeVcVictory },
        ],
      },
    },
    // -----------------------------------------------------------------------
    // Phase 6.2 — Resources
    // -----------------------------------------------------------------------
    {
      kind: 'simple',
      label: 'Resources resolution',
      move: {
        actionId: asActionId('coupResourcesResolve'),
        params: {},
      },
      expectedState: {
        globalVars: {
          arvnResources: 47,
          vcResources: 17,
          nvaResources: 7,
          aid: 11,
          patronage: 15,
          trail: 1,
        },
      },
    },
    // -----------------------------------------------------------------------
    // Phase 6.3 — Support: US Pacification
    // -----------------------------------------------------------------------
    // US Pacify Hue: remove terror (cost 3 ARVN res)
    {
      kind: 'resolved',
      label: 'US Pacify Hue — remove terror',
      move: {
        actionId: asActionId('coupPacifyUS'),
        params: {
          targetSpace: 'hue:none',
          action: 'removeTerror',
        },
      },
      expectedState: {
        globalVars: { arvnResources: 44 },
        // Narrative: "spend 3 ARVN resources to remove that [Terror] marker"
        zoneVars: [
          { zone: 'hue:none', variable: 'terrorCount', expected: 0 },
        ],
      },
    },
    // US Pacify Hue: shift toward support (cost 3 ARVN res)
    {
      kind: 'resolved',
      label: 'US Pacify Hue — shift support 1',
      move: {
        actionId: asActionId('coupPacifyUS'),
        params: {
          targetSpace: 'hue:none',
          action: 'shiftSupport',
        },
      },
      expectedState: {
        globalVars: { arvnResources: 41 },
        markers: [
          { space: 'hue:none', marker: 'supportOpposition', expected: 'passiveOpposition' },
        ],
      },
    },
    // US Pacify Hue: shift toward support again (cost 3 ARVN res)
    {
      kind: 'resolved',
      label: 'US Pacify Hue — shift support 2',
      move: {
        actionId: asActionId('coupPacifyUS'),
        params: {
          targetSpace: 'hue:none',
          action: 'shiftSupport',
        },
      },
      expectedState: {
        globalVars: { arvnResources: 38 },
        markers: [
          { space: 'hue:none', marker: 'supportOpposition', expected: 'neutral' },
        ],
        // Narrative: "Lower the blue VC 'Oppose+Bases' VP token from 27 to 23"
        // Narrative: "The US victory point token doesn't change because there is no Support in Hue"
        computedValues: [
          { label: 'VC VP after Hue neutralized', expected: 23, compute: computeVcVictory },
          { label: 'US VP unchanged (Hue neutral, no support)', expected: 42, compute: computeUsVictory },
        ],
      },
    },
    // US Pacify Saigon: shift to active support (cost 3 ARVN res)
    {
      kind: 'resolved',
      label: 'US Pacify Saigon — shift to active support',
      move: {
        actionId: asActionId('coupPacifyUS'),
        params: {
          targetSpace: 'saigon:none',
          action: 'shiftSupport',
        },
      },
      expectedState: {
        globalVars: { arvnResources: 35 },
        markers: [
          { space: 'saigon:none', marker: 'supportOpposition', expected: 'activeSupport' },
        ],
        computedValues: [
          { label: 'US victory marker after Saigon pacify', expected: 48, compute: computeUsVictory },
        ],
      },
    },
    // US passes further pacification
    {
      kind: 'simple',
      label: 'US passes pacification',
      move: {
        actionId: asActionId('coupPacifyPass'),
        params: {},
      },
    },
    // ARVN passes pacification
    {
      kind: 'simple',
      label: 'ARVN passes pacification',
      move: {
        actionId: asActionId('coupPacifyPass'),
        params: {},
      },
    },
    // -----------------------------------------------------------------------
    // Phase 6.3 — Support: VC Agitation
    // -----------------------------------------------------------------------
    // VC Agitate Quang Tri (pop 2): passive → active opposition (cost 1 VC res)
    {
      kind: 'resolved',
      label: 'VC Agitate Quang Tri',
      move: {
        actionId: asActionId('coupAgitateVC'),
        params: {
          targetSpace: 'quang-tri-thua-thien:none',
          action: 'shiftOpposition',
        },
      },
      expectedState: {
        globalVars: { vcResources: 16 },
        markers: [
          { space: 'quang-tri-thua-thien:none', marker: 'supportOpposition', expected: 'activeOpposition' },
        ],
      },
    },
    // VC Agitate Quang Tin (pop 2): passive → active opposition (cost 1 VC res)
    {
      kind: 'resolved',
      label: 'VC Agitate Quang Tin',
      move: {
        actionId: asActionId('coupAgitateVC'),
        params: {
          targetSpace: 'quang-tin-quang-ngai:none',
          action: 'shiftOpposition',
        },
      },
      expectedState: {
        globalVars: { vcResources: 15 },
        markers: [
          { space: 'quang-tin-quang-ngai:none', marker: 'supportOpposition', expected: 'activeOpposition' },
        ],
      },
    },
    // VC Agitate Quang Duc (pop 1): passive → active opposition (cost 1 VC res)
    {
      kind: 'resolved',
      label: 'VC Agitate Quang Duc',
      move: {
        actionId: asActionId('coupAgitateVC'),
        params: {
          targetSpace: 'quang-duc-long-khanh:none',
          action: 'shiftOpposition',
        },
      },
      expectedState: {
        globalVars: { vcResources: 14 },
        markers: [
          { space: 'quang-duc-long-khanh:none', marker: 'supportOpposition', expected: 'activeOpposition' },
        ],
      },
    },
    // VC Agitate Binh Tuy (pop 1): passive → active opposition (cost 1 VC res)
    {
      kind: 'resolved',
      label: 'VC Agitate Binh Tuy',
      move: {
        actionId: asActionId('coupAgitateVC'),
        params: {
          targetSpace: 'binh-tuy-binh-thuan:none',
          action: 'shiftOpposition',
        },
      },
      expectedState: {
        globalVars: { vcResources: 13 },
        markers: [
          { space: 'binh-tuy-binh-thuan:none', marker: 'supportOpposition', expected: 'activeOpposition' },
        ],
        computedValues: [
          { label: 'VC victory after agitation', expected: 29, compute: computeVcVictory },
        ],
      },
    },
    // VC passes agitation
    {
      kind: 'simple',
      label: 'VC passes agitation',
      move: {
        actionId: asActionId('coupAgitatePass'),
        params: {},
      },
    },
    // -----------------------------------------------------------------------
    // Phase 6.4 — Redeploy
    // -----------------------------------------------------------------------
    // US has no redeploy actions — explicit pass
    {
      kind: 'simple',
      label: 'US passes redeploy',
      move: {
        actionId: asActionId('coupRedeployPass'),
        params: {},
      },
    },
    // ARVN mandatory: Binh Dinh troop → Qui Nhon
    {
      kind: 'simple',
      label: 'ARVN mandatory redeploy Binh Dinh troop to Qui Nhon',
      move: {
        actionId: asActionId('coupArvnRedeployMandatory'),
        params: {
          sourceSpace: 'binh-dinh:none',
          targetSpace: 'qui-nhon:none',
        },
      },
    },
    // ARVN mandatory: Binh Dinh troop → Da Nang
    {
      kind: 'simple',
      label: 'ARVN mandatory redeploy Binh Dinh troop to Da Nang',
      move: {
        actionId: asActionId('coupArvnRedeployMandatory'),
        params: {
          sourceSpace: 'binh-dinh:none',
          targetSpace: 'da-nang:none',
        },
      },
    },
    // ARVN police: Saigon → loc-saigon-can-tho
    {
      kind: 'simple',
      label: 'ARVN redeploy police Saigon to LoC Saigon-Can Tho',
      move: {
        actionId: asActionId('coupArvnRedeployPolice'),
        params: {
          sourceSpace: 'saigon:none',
          targetSpace: 'loc-saigon-can-tho:none',
        },
      },
    },
    // ARVN passes redeploy
    {
      kind: 'simple',
      label: 'ARVN passes redeploy',
      move: {
        actionId: asActionId('coupRedeployPass'),
        params: {},
      },
      expectedState: {
        // Narrative: 2 ARVN troops left Binh Dinh, 1→Qui Nhon, 1→Da Nang
        zoneTokenCounts: [
          { zone: 'binh-dinh:none', faction: 'ARVN', type: 'troops', count: 0 },
          { zone: 'qui-nhon:none', faction: 'ARVN', type: 'troops', count: 1 },
          { zone: 'da-nang:none', faction: 'ARVN', type: 'troops', count: 1 },
          // Narrative: 1 police Saigon → LoC Saigon-Can Tho
          { zone: 'loc-saigon-can-tho:none', faction: 'ARVN', type: 'police', count: 1 },
          // Narrative: ARVN ranger in Quang Tri stays
          { zone: 'quang-tri-thua-thien:none', faction: 'ARVN', type: 'ranger', count: 1 },
          // Narrative: "6 ARVN Troops in Pleiku may stay due to the US Base"
          { zone: 'pleiku-darlac:none', faction: 'ARVN', type: 'troops', count: 6 },
          // Narrative: "take 1 Police from Saigon" (decrement from prior count)
          { zone: 'saigon:none', faction: 'ARVN', type: 'police', count: 2 },
        ],
      },
    },
    // NVA redeploy: 4 troops from Southern Laos → North Vietnam
    {
      kind: 'simple',
      label: 'NVA redeploy troop 1 Southern Laos to North Vietnam',
      move: {
        actionId: asActionId('coupNvaRedeployTroops'),
        params: {
          sourceSpace: 'southern-laos:none',
          targetSpace: 'north-vietnam:none',
        },
      },
    },
    {
      kind: 'simple',
      label: 'NVA redeploy troop 2 Southern Laos to North Vietnam',
      move: {
        actionId: asActionId('coupNvaRedeployTroops'),
        params: {
          sourceSpace: 'southern-laos:none',
          targetSpace: 'north-vietnam:none',
        },
      },
    },
    {
      kind: 'simple',
      label: 'NVA redeploy troop 3 Southern Laos to North Vietnam',
      move: {
        actionId: asActionId('coupNvaRedeployTroops'),
        params: {
          sourceSpace: 'southern-laos:none',
          targetSpace: 'north-vietnam:none',
        },
      },
    },
    {
      kind: 'simple',
      label: 'NVA redeploy troop 4 Southern Laos to North Vietnam',
      move: {
        actionId: asActionId('coupNvaRedeployTroops'),
        params: {
          sourceSpace: 'southern-laos:none',
          targetSpace: 'north-vietnam:none',
        },
      },
    },
    // NVA passes redeploy
    {
      kind: 'simple',
      label: 'NVA passes redeploy',
      move: {
        actionId: asActionId('coupRedeployPass'),
        params: {},
      },
      expectedState: {
        // Narrative: NVA moved 4 of 5 troops from Southern Laos → North Vietnam
        zoneTokenCounts: [
          { zone: 'southern-laos:none', faction: 'NVA', type: 'troops', count: 1 },
          // Narrative: "shift them to North Vietnam" — calibrating actual count
          { zone: 'north-vietnam:none', faction: 'NVA', type: 'troops', count: 4 },
        ],
      },
    },
    // VC has no redeploy actions — explicit pass
    {
      kind: 'simple',
      label: 'VC passes redeploy',
      move: {
        actionId: asActionId('coupRedeployPass'),
        params: {},
      },
      // Narrative 6.4.4: "examining the entire map, we see that no space Control
      // has changed" — verify all faction VPs unchanged after redeploy.
      expectedState: {
        computedValues: [
          { label: 'US VP unchanged after redeploy', expected: 48, compute: computeUsVictory },
          { label: 'ARVN VP unchanged after redeploy', expected: 38, compute: computeArvnVictory },
          { label: 'NVA VP unchanged after redeploy', expected: 8, compute: computeNvaVictory },
          { label: 'VC VP unchanged after redeploy', expected: 29, compute: computeVcVictory },
        ],
      },
    },
    // -----------------------------------------------------------------------
    // Phase 6.5 — Commitment
    // -----------------------------------------------------------------------
    // Narrative: 1 casualty ÷ 3 = 0 OOP; troop → Available (VP 48→49).
    // Then: 1 Available → An Loc (VP 49→48), 1 Binh Dinh → Qui Nhon,
    //        1 Saigon → Can Tho, 1 Saigon → Cam Ranh. 0 bases.
    {
      kind: 'resolved',
      label: 'US Commitment resolution',
      move: {
        actionId: asActionId('coupCommitmentResolve'),
        params: {},
      },
      optionsFactory: createTurn8CommitmentOverrides,
      expectedState: {
        // Casualties cleared, troops deployed/moved
        zoneTokenCounts: [
          { zone: 'casualties-US:none', faction: 'US', type: 'troops', count: 0 },
          { zone: 'an-loc:none', faction: 'US', type: 'troops', count: 1 },
          // Narrative: "Troop cube from Binh Dinh → City of Qui Nhon"
          { zone: 'qui-nhon:none', faction: 'US', type: 'troops', count: 1 },
          // Narrative: "1 US Troop from Saigon → City of Can Tho"
          { zone: 'can-tho:none', faction: 'US', type: 'troops', count: 1 },
          // Narrative: "another Troop from Saigon → City of Cam Ranh"
          { zone: 'cam-ranh:none', faction: 'US', type: 'troops', count: 1 },
        ],
        computedValues: [
          { label: 'US VP after commitment', expected: 48, compute: computeUsVictory },
        ],
      },
    },
    // US passes commitment
    {
      kind: 'simple',
      label: 'US passes commitment',
      move: {
        actionId: asActionId('coupCommitmentPass'),
        params: {},
      },
    },
    // ARVN has no commitment actions — explicit pass
    {
      kind: 'simple',
      label: 'ARVN passes commitment',
      move: {
        actionId: asActionId('coupCommitmentPass'),
        params: {},
      },
    },
    // NVA has no commitment actions — explicit pass
    {
      kind: 'simple',
      label: 'NVA passes commitment',
      move: {
        actionId: asActionId('coupCommitmentPass'),
        params: {},
      },
    },
    // VC has no commitment actions — explicit pass
    {
      kind: 'simple',
      label: 'VC passes commitment',
      move: {
        actionId: asActionId('coupCommitmentPass'),
        params: {},
      },
    },
  ],
  expectedEndState: {
    globalVars: {
      aid: 11,
      arvnResources: 35,
      nvaResources: 7,
      vcResources: 13,
      patronage: 15,
      trail: 1,
    },
    // After reset (6.6): all factions eligible, new card = Sihanouk
    eligibility: { '0': true, '1': true, '2': true, '3': true },
    currentCard: 'card-75',  // Sihanouk
    previewCard: 'card-17',  // Claymores
    deckSize: 3,
    globalMarkers: [
      { marker: 'cap_boobyTraps', expected: 'shaded' },
    ],
    markers: [
      { space: 'hue:none', marker: 'supportOpposition', expected: 'neutral' },
      { space: 'saigon:none', marker: 'supportOpposition', expected: 'activeSupport' },
      { space: 'quang-tri-thua-thien:none', marker: 'supportOpposition', expected: 'activeOpposition' },
      { space: 'quang-tin-quang-ngai:none', marker: 'supportOpposition', expected: 'activeOpposition' },
      { space: 'quang-duc-long-khanh:none', marker: 'supportOpposition', expected: 'activeOpposition' },
      { space: 'binh-tuy-binh-thuan:none', marker: 'supportOpposition', expected: 'activeOpposition' },
    ],
    zoneTokenCounts: [
      // Casualties cleared during commitment
      { zone: 'casualties-US:none', faction: 'US', type: 'troops', count: 0 },
      // Commitment results (6.5): troop deployments/moves
      { zone: 'an-loc:none', faction: 'US', type: 'troops', count: 1 },
      { zone: 'qui-nhon:none', faction: 'US', type: 'troops', count: 1 },
      { zone: 'can-tho:none', faction: 'US', type: 'troops', count: 1 },
      { zone: 'cam-ranh:none', faction: 'US', type: 'troops', count: 1 },
      // Redeploy results (6.4)
      { zone: 'binh-dinh:none', faction: 'ARVN', type: 'troops', count: 0 },
      { zone: 'southern-laos:none', faction: 'NVA', type: 'troops', count: 1 },
      // Reset (6.6): all guerrillas and SF flip underground
      { zone: 'quang-tri-thua-thien:none', faction: 'NVA', type: 'guerrilla', count: 5,
        props: { activity: 'underground' } },
      { zone: 'quang-tri-thua-thien:none', faction: 'VC', type: 'guerrilla', count: 3,
        props: { activity: 'underground' } },
      { zone: 'quang-tri-thua-thien:none', faction: 'ARVN', type: 'ranger', count: 1,
        props: { activity: 'underground' } },
    ],
    cardsInZones: [
      { zone: 'leader:none', cardId: 'card-125', present: true },
      { zone: 'played:none', cardId: 'card-125', present: false },
    ],
    computedValues: [
      { label: 'VC victory marker', expected: 29, compute: computeVcVictory },
      { label: 'NVA victory marker', expected: 8, compute: computeNvaVictory },
      // Narrative: US VP 48 (49 from casualty return, −1 for An Loc deployment)
      { label: 'US victory marker', expected: 48, compute: computeUsVictory },
      // Narrative: No control changes during redeploy (6.4.4); verify ARVN VP
      { label: 'ARVN victory marker', expected: 38, compute: computeArvnVictory },
    ],
  },
};

// ---------------------------------------------------------------------------
// Playbook turns in execution order
// ---------------------------------------------------------------------------

const PLAYBOOK_TURNS: readonly PlaybookTurn[] = [TURN_1, TURN_2, TURN_3, TURN_4, TURN_5, TURN_6, TURN_7, TURN_8];

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
      cardsInZones: [
        { zone: 'leader:none', cardId: 'card-121', present: true },
        { zone: 'leader:none', cardId: 'card-122', present: true },
        { zone: 'leader:none', cardId: 'card-123', present: true },
        { zone: 'leader:none', cardId: 'card-124', present: true },
      ],
      zoneTokenCounts: [
        { zone: 'saigon:none', faction: 'US', type: 'troops', count: 2 },
        { zone: 'saigon:none', faction: 'US', type: 'base', count: 1 },
        { zone: 'saigon:none', faction: 'ARVN', type: 'troops', count: 2 },
        { zone: 'saigon:none', faction: 'ARVN', type: 'police', count: 3 },
        // An Loc & Can Tho baselines (Govern prerequisites for Turn 1)
        { zone: 'an-loc:none', faction: 'ARVN', type: 'troops', count: 2 },
        { zone: 'an-loc:none', faction: 'ARVN', type: 'police', count: 2 },
        { zone: 'can-tho:none', faction: 'ARVN', type: 'troops', count: 2 },
        { zone: 'can-tho:none', faction: 'ARVN', type: 'police', count: 2 },
        // ARVN Available troop baseline (8 troops before Training)
        { zone: 'available-ARVN:none', faction: 'ARVN', type: 'troops', count: 8 },
      ],
      totalTokenCounts: [
        { faction: 'ARVN', type: 'troops', count: 30 },
      ],
      markers: [
        { space: 'saigon:none', marker: 'supportOpposition', expected: 'passiveSupport' },
      ],
      // RVN Leader: Duong Van Minh active at start
      globalMarkers: [
        { marker: 'activeLeader', expected: 'minh' },
      ],
      // Victory markers at game start (US = Total Support 15 + Available US Troops+Bases 23 = 38)
      computedValues: [
        { label: 'US victory marker', expected: 38, compute: computeUsVictory },
        { label: 'NVA victory marker', expected: 4, compute: computeNvaVictory },
      ],
    }, 'initial state', def);
  });

  for (const [turnIndex, turn] of PLAYBOOK_TURNS.entries()) {
    it(turn.label, () => {
      const start = stateBeforeTurn(turnIndex);
      replayPlaybookTurn(def, start, turn);
    });
  }


});
