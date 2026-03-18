/**
 * FITL-specific MCTS test infrastructure.
 *
 * Provides: compiled FITL def (cached), playbook deck engineering,
 * turn descriptors for replay (stripped of assertion snapshots),
 * replay-to-decision-point, MCTS single-position search, and
 * category/victory-trend assertions.
 */
import * as assert from 'node:assert/strict';

import {
  applyMove,
  asActionId,
  asTokenId,
  assertValidatedGameDef,
  computeVictoryMarker,
  createGameDefRuntime,
  createRng,
  derivePlayerObservation,
  fork,
  initialState,
  legalMoves,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type MarkerWeightConfig,
  type Move,
  type PlayerId,
  type SeatGroupConfig,
  type Token,
  type ValidatedGameDef,
  type VictoryFormula,
  type ZoneDef,
} from '../../../src/kernel/index.js';
import { advanceToDecisionPoint } from '../../../src/kernel/phase-advance.js';
import { initializeTurnFlowEligibilityState } from '../../../src/kernel/turn-flow-eligibility.js';

import {
  resolveBudgetProfile,
  runSearch,
  createRootNode,
  createNodePool,
  selectRootDecision,
} from '../../../src/agents/index.js';
import type { MctsBudgetProfile, MctsSearchDiagnostics, MctsSearchVisitor } from '../../../src/agents/index.js';

import { assertNoErrors } from '../../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../../helpers/production-spec-helpers.js';
import { matchesDecisionRequest } from '../../helpers/decision-key-matchers.js';
import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
  type ResolveDecisionParamsOptions,
} from '../../helpers/decision-param-helpers.js';

import type { PlaybookMove } from '../../helpers/fitl-playbook-harness.js';

// ---------------------------------------------------------------------------
// Env gate
// ---------------------------------------------------------------------------

export const RUN_MCTS_FITL_E2E = process.env.RUN_MCTS_FITL_E2E === '1';

// ---------------------------------------------------------------------------
// FITL compilation (cached)
// ---------------------------------------------------------------------------

let cachedFitlDef: ValidatedGameDef | null = null;

export const compileFitlDef = (): ValidatedGameDef => {
  if (cachedFitlDef !== null) return cachedFitlDef;
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef to be present');
  }
  cachedFitlDef = assertValidatedGameDef(compiled.gameDef);
  return cachedFitlDef;
};

// ---------------------------------------------------------------------------
// Victory formula configs (identical to golden test)
// ---------------------------------------------------------------------------

export const FITL_FACTION_CONFIG: SeatGroupConfig = {
  coinSeats: ['US', 'ARVN'],
  insurgentSeats: ['NVA', 'VC'],
  soloSeat: 'NVA',
  seatProp: 'faction',
};

const FITL_SUPPORT_CONFIG: MarkerWeightConfig = {
  activeState: 'activeSupport',
  passiveState: 'passiveSupport',
};

const FITL_OPPOSITION_CONFIG: MarkerWeightConfig = {
  activeState: 'activeOpposition',
  passiveState: 'passiveOpposition',
};

export const FITL_US_FORMULA: VictoryFormula = {
  type: 'markerTotalPlusZoneCount',
  markerConfig: FITL_SUPPORT_CONFIG,
  countZone: 'available-US:none',
  countTokenTypes: ['us-troops', 'us-bases'],
};

export const FITL_NVA_FORMULA: VictoryFormula = {
  type: 'controlledPopulationPlusMapBases',
  controlFn: 'solo',
  baseSeat: 'NVA',
  basePieceTypes: ['nva-bases'],
};

export const FITL_VC_FORMULA: VictoryFormula = {
  type: 'markerTotalPlusMapBases',
  markerConfig: FITL_OPPOSITION_CONFIG,
  baseSeat: 'VC',
  basePieceTypes: ['vc-bases'],
};

export const FITL_ARVN_FORMULA: VictoryFormula = {
  type: 'controlledPopulationPlusGlobalVar',
  controlFn: 'coin',
  varName: 'patronage',
};

// ---------------------------------------------------------------------------
// Victory score helpers
// ---------------------------------------------------------------------------

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

export const computeUsVictory = (def: GameDef, state: GameState): number =>
  computeVictoryMarker(def, state, mapSpaces(def), supportOppositionBySpace(def, state),
    FITL_FACTION_CONFIG, FITL_US_FORMULA);

export const computeNvaVictory = (def: GameDef, state: GameState): number =>
  computeVictoryMarker(def, state, mapSpaces(def), supportOppositionBySpace(def, state),
    FITL_FACTION_CONFIG, FITL_NVA_FORMULA);

export const computeVcVictory = (def: GameDef, state: GameState): number =>
  computeVictoryMarker(def, state, mapSpaces(def), supportOppositionBySpace(def, state),
    FITL_FACTION_CONFIG, FITL_VC_FORMULA);

export const computeArvnVictory = (def: GameDef, state: GameState): number =>
  computeVictoryMarker(def, state, mapSpaces(def), supportOppositionBySpace(def, state),
    FITL_FACTION_CONFIG, FITL_ARVN_FORMULA);

// ---------------------------------------------------------------------------
// Playbook deck
// ---------------------------------------------------------------------------

export const PLAYBOOK_DECK_IDS: readonly string[] = [
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

export const engineerPlaybookDeck = (state: GameState): GameState => {
  const startOrdinal = state.nextTokenOrdinal;
  const orderedCards = PLAYBOOK_DECK_IDS.map((cardId, index) =>
    makeCardToken(cardId, startOrdinal + index),
  );
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
// Decision override utilities (from golden test)
// ---------------------------------------------------------------------------

const choiceStringOptions = (request: ChoicePendingRequest): readonly string[] =>
  request.options
    .map((option) => option.value)
    .filter((value): value is string => typeof value === 'string');

const requestOffersAll = (
  request: ChoicePendingRequest,
  required: readonly string[],
): boolean => {
  const options = new Set(choiceStringOptions(request));
  return required.every((value) => options.has(value));
};

// ---------------------------------------------------------------------------
// Turn 4 event decision overrides (Gulf of Tonkin deployment)
// ---------------------------------------------------------------------------

const createTurn4EventDecisionOverrides = (): readonly DecisionOverrideRule[] => {
  let cityAssignmentIndex = 0;
  return [
    {
      when: (request: ChoicePendingRequest) =>
        (request.type === 'chooseN' && /\$selectedPieces/u.test(request.name))
        || matchesDecisionRequest({
          type: 'chooseN',
          baseIdPattern: /distributeTokens\.selectTokens$/u,
        })(request),
      value: (request: ChoicePendingRequest) => {
        const allValues = request.options
          .map((option) => option.value)
          .filter((value): value is string => typeof value === 'string');
        const troops = allValues.filter((v) => v.includes('us-troops'));
        const bases = allValues.filter((v) => v.includes('us-bases'));
        return [...troops.slice(0, 5), ...bases.slice(0, 1)];
      },
    },
    {
      when: (request: ChoicePendingRequest) =>
        /\$targetCity@/u.test(request.name)
        || matchesDecisionRequest({
          baseIdPattern: /distributeTokens\.chooseDestination$/u,
        })(request),
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

// ---------------------------------------------------------------------------
// Turn 4 NVA March+Infiltrate decision overrides
// ---------------------------------------------------------------------------

const createTurn4NvaReportBranchDecisionOverrides = (): readonly DecisionOverrideRule[] => [
  {
    when: (request: ChoicePendingRequest) =>
      request.name === '$targetSpaces'
      && matchesDecisionRequest({
        baseIdPattern: /doc\.actionPipelines\.10\.stages\[0\]\.effects\.0/u,
      })(request),
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
      request.name === '$targetSpaces'
      && requestOffersAll(request, [
        'southern-laos:none',
        'kien-giang-an-xuyen:none',
      ]),
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
// Turn 6 ARVN Sweep+Raid decision overrides
// ---------------------------------------------------------------------------

const createTurn6ArvnDecisionOverrides = (): readonly DecisionOverrideRule[] => [
  {
    when: (request: ChoicePendingRequest) =>
      request.name === '$movingTroops@binh-dinh:none',
    value: (request: ChoicePendingRequest) =>
      request.options
        .map((option) => option.value)
        .filter((value): value is string => typeof value === 'string'),
  },
  {
    when: (request: ChoicePendingRequest) =>
      request.name === '$movingTroops@pleiku-darlac:none',
    value: [],
  },
  {
    when: (request: ChoicePendingRequest) =>
      request.name.endsWith('hopLocs_pleiku-darlac:none')
      && request.options.some((o) => o.value === 'loc-saigon-an-loc-ban-me-thuot:none'),
    value: ['loc-saigon-an-loc-ban-me-thuot:none'],
  },
  {
    when: (request: ChoicePendingRequest) =>
      request.name.endsWith('movingHopTroops_pleiku-darlac:none'),
    value: (request: ChoicePendingRequest) =>
      request.options
        .map((option) => option.value)
        .filter((value): value is string => typeof value === 'string')
        .slice(2, 8),
  },
  {
    when: (request: ChoicePendingRequest) =>
      request.name === '$raidIncomingFrom@quang-tri-thua-thien:none',
    value: ['quang-nam:none'],
  },
  {
    when: (request: ChoicePendingRequest) =>
      request.name === '$raidRemove@quang-tri-thua-thien:none',
    value: 'yes',
  },
];

// ---------------------------------------------------------------------------
// Turn 8 commitment decision overrides
// ---------------------------------------------------------------------------

// Kept for future scenarios that need to replay through coup commitment (Turn 8 phase 6.5).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _createTurn8CommitmentOverrides = (
  _def: GameDef,
  state: GameState,
): ResolveDecisionParamsOptions => {
  const tokenZoneLookup = new Map<string, string>();
  for (const [zoneId, tokens] of Object.entries(state.zones)) {
    for (const token of tokens ?? []) {
      tokenZoneLookup.set(String(token.id), zoneId);
    }
  }

  let mapTroopDestIndex = 0;
  const mapTroopDestinations = ['qui-nhon:none', 'can-tho:none', 'cam-ranh:none'];

  const nameEndsWith = (request: ChoicePendingRequest, suffix: string): boolean =>
    request.name.endsWith(suffix);

  return {
    overrides: [
      {
        when: (request: ChoicePendingRequest) =>
          nameEndsWith(request, 'commitTroopsFromAvailable'),
        value: (request: ChoicePendingRequest) =>
          request.options
            .map((option) => option.value)
            .filter((value): value is string => typeof value === 'string')
            .slice(0, 1),
      },
      {
        when: (request: ChoicePendingRequest) =>
          nameEndsWith(request, 'commitTroopDestFromAvailable'),
        value: 'an-loc:none',
      },
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
      {
        when: (request: ChoicePendingRequest) =>
          nameEndsWith(request, 'commitTroopMapMoveMode'),
        value: 'to-map',
      },
      {
        when: (request: ChoicePendingRequest) =>
          nameEndsWith(request, 'commitTroopDestFromMap'),
        value: () => {
          const dest = mapTroopDestinations[mapTroopDestIndex];
          mapTroopDestIndex += 1;
          return dest;
        },
      },
      {
        when: (request: ChoicePendingRequest) =>
          nameEndsWith(request, 'commitBasesFromAvailable'),
        value: [],
      },
      {
        when: (request: ChoicePendingRequest) =>
          nameEndsWith(request, 'commitBasesFromMap'),
        value: [],
      },
    ],
  };
};

// ---------------------------------------------------------------------------
// Turn move descriptors (stripped of assertion snapshots)
// ---------------------------------------------------------------------------
// Only the `moves` array is needed for replay — no expectedEndState checks.
// The golden test validates correctness; these are purely for state setup.
// ---------------------------------------------------------------------------

interface ReplayTurn {
  readonly label: string;
  readonly moves: readonly PlaybookMove[];
}

const TURN_1_MOVES: ReplayTurn = {
  label: 'Turn 1 — Burning Bonze',
  moves: [
    {
      kind: 'simple',
      label: 'VC shaded Burning Bonze',
      move: { actionId: asActionId('event'), params: { eventCardId: 'card-107', side: 'shaded' } },
    },
    {
      kind: 'simple',
      label: 'NVA passes',
      move: { actionId: asActionId('pass'), params: {} },
    },
    {
      kind: 'resolved',
      label: 'ARVN Train + Govern',
      move: {
        actionId: asActionId('train'),
        actionClass: 'operationPlusSpecialActivity',
        params: {
          $targetSpaces: ['saigon:none'],
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
              $targetSpaces: ['an-loc:none', 'can-tho:none'],
              '$governMode@an-loc:none': 'aid',
              '$governMode@can-tho:none': 'aid',
            },
          },
          timing: 'after',
        },
      },
    },
  ],
};

const TURN_2_MOVES: ReplayTurn = {
  label: 'Turn 2 — Trucks',
  moves: [
    {
      kind: 'resolved',
      label: 'NVA Rally (Op Only)',
      move: {
        actionId: asActionId('rally'),
        actionClass: 'operation',
        params: {
          $targetSpaces: [
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
        params: { $targetSpaces: ['quang-tri-thua-thien:none'] },
      },
    },
  ],
};

const TURN_3_MOVES: ReplayTurn = {
  label: 'Turn 3 — Green Berets',
  moves: [
    {
      kind: 'resolved',
      label: 'ARVN unshaded Green Berets',
      move: {
        actionId: asActionId('event'),
        params: {
          eventCardId: 'card-68',
          side: 'unshaded',
          branch: 'place-irregulars-and-support',
          $targetProvince: 'binh-dinh:none',
        },
      },
    },
    {
      kind: 'resolved',
      label: 'VC Rally + Tax',
      move: {
        actionId: asActionId('rally'),
        actionClass: 'operationPlusSpecialActivity',
        params: {
          $targetSpaces: ['pleiku-darlac:none', 'quang-tri-thua-thien:none', 'hue:none'],
          $withBaseChoice: 'place-guerrillas',
          $noBaseChoice: 'place-guerrilla',
        },
        compound: {
          specialActivity: {
            actionId: asActionId('tax'),
            actionClass: 'operationPlusSpecialActivity',
            params: {
              $targetSpaces: [
                'quang-tin-quang-ngai:none',
                'quang-duc-long-khanh:none',
                'binh-tuy-binh-thuan:none',
              ],
            },
          },
          timing: 'after',
        },
      },
    },
  ],
};

const TURN_4_MOVES: ReplayTurn = {
  label: 'Turn 4 — Gulf of Tonkin',
  moves: [
    {
      kind: 'resolved',
      label: 'US unshaded Gulf of Tonkin',
      move: {
        actionId: asActionId('event'),
        params: { eventCardId: 'card-1', side: 'unshaded' },
      },
      optionsFactory: () => ({ overrides: createTurn4EventDecisionOverrides() }),
    },
    {
      kind: 'resolved',
      label: 'US free Air Strike in Quang Tri',
      move: {
        actionId: asActionId('airStrike'),
        actionClass: 'specialActivity',
        freeOperation: true,
        params: {
          $arcLightNoCoinProvinces: [],
          $spaces: ['quang-tri-thua-thien:none'],
          $degradeTrail: 'yes',
        },
      },
      optionsFactory: () => ({ overrides: createTurn4EventDecisionOverrides() }),
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
      options: { overrides: createTurn4NvaReportBranchDecisionOverrides() },
    },
  ],
};

const TURN_5_MOVES: ReplayTurn = {
  label: 'Turn 5 — Brinks Hotel',
  moves: [
    {
      kind: 'resolved',
      label: 'VC shaded Brinks Hotel',
      move: {
        actionId: asActionId('event'),
        params: { eventCardId: 'card-97', side: 'shaded' },
      },
    },
    {
      kind: 'simple',
      label: 'ARVN passes',
      move: { actionId: asActionId('pass'), params: {} },
    },
  ],
};

const TURN_6_MOVES: ReplayTurn = {
  label: 'Turn 6 — Henry Cabot Lodge',
  moves: [
    {
      kind: 'resolved',
      label: 'ARVN Sweep + Raid',
      move: {
        actionId: asActionId('sweep'),
        actionClass: 'operationPlusSpecialActivity',
        params: { $targetSpaces: ['binh-dinh:none', 'pleiku-darlac:none'] },
        compound: {
          specialActivity: {
            actionId: asActionId('raid'),
            actionClass: 'operationPlusSpecialActivity',
            params: {
              $targetSpaces: ['quang-tri-thua-thien:none'],
              '$raidIncomingFrom@quang-tri-thua-thien:none': ['quang-nam:none'],
              '$raidRemove@quang-tri-thua-thien:none': 'yes',
            },
          },
          timing: 'before',
        },
      },
      options: { overrides: createTurn6ArvnDecisionOverrides() },
    },
    {
      kind: 'simple',
      label: 'NVA passes',
      move: { actionId: asActionId('pass'), params: {} },
    },
    {
      kind: 'resolved',
      label: 'US Limited Op Assault in Pleiku',
      move: {
        actionId: asActionId('assault'),
        actionClass: 'limitedOperation',
        params: {
          $targetSpaces: ['pleiku-darlac:none'],
          $arvnFollowupSpaces: ['pleiku-darlac:none'],
        },
      },
    },
  ],
};

const TURN_7_MOVES: ReplayTurn = {
  label: 'Turn 7 — Booby Traps',
  moves: [
    {
      kind: 'simple',
      label: 'VC shaded Booby Traps',
      move: {
        actionId: asActionId('event'),
        params: { eventCardId: 'card-101', side: 'shaded' },
      },
    },
    {
      kind: 'resolved',
      label: 'NVA Attack + Ambush in Quang Tri',
      move: {
        actionId: asActionId('attack'),
        actionClass: 'operationPlusSpecialActivity',
        params: { $targetSpaces: ['quang-tri-thua-thien:none'] },
        compound: {
          specialActivity: {
            actionId: asActionId('ambushNva'),
            actionClass: 'operationPlusSpecialActivity',
            params: { $targetSpaces: ['quang-tri-thua-thien:none'] },
          },
          timing: 'during',
          insertAfterStage: 1,
          replaceRemainingStages: true,
        },
      },
    },
  ],
};

// Turn 8 coup moves needed for scenario 10 (up to pacification phase)
const TURN_8_PRE_PACIFY_MOVES: ReplayTurn = {
  label: 'Turn 8 — Coup pre-pacification',
  moves: [
    {
      kind: 'simple',
      label: 'Victory check',
      move: { actionId: asActionId('coupVictoryCheck'), params: {} },
    },
    {
      kind: 'simple',
      label: 'Resources resolution',
      move: { actionId: asActionId('coupResourcesResolve'), params: {} },
    },
  ],
};

export const REPLAY_TURNS: readonly ReplayTurn[] = [
  TURN_1_MOVES, TURN_2_MOVES, TURN_3_MOVES, TURN_4_MOVES,
  TURN_5_MOVES, TURN_6_MOVES, TURN_7_MOVES, TURN_8_PRE_PACIFY_MOVES,
];

// ---------------------------------------------------------------------------
// Replay infrastructure
// ---------------------------------------------------------------------------

/**
 * Apply a sequence of PlaybookMoves without any assertions.
 * Used for state setup before MCTS search.
 */
const replayMoves = (
  def: ValidatedGameDef,
  state: GameState,
  moves: readonly PlaybookMove[],
): GameState => {
  let current = state;
  for (const playMove of moves) {
    if (playMove.kind === 'simple') {
      current = applyMove(def, current, playMove.move).state;
    } else {
      const effectiveOptions = playMove.optionsFactory?.(def, current) ?? playMove.options;
      current = applyMoveWithResolvedDecisionIds(def, current, playMove.move, effectiveOptions).state;
    }
  }
  return current;
};

// Cache intermediate states for performance (keyed by turn index)
const stateCache = new Map<number, GameState>();

/**
 * Prepare the initial FITL playbook state: compile, init, engineer deck,
 * initialize turn flow, advance to first decision point.
 */
export const createPlaybookBaseState = (def: ValidatedGameDef): GameState => {
  const raw = initialState(def, 42, 4).state;
  const withDeck = engineerPlaybookDeck(raw);
  const engineered = initializeTurnFlowEligibilityState(def, withDeck);
  return advanceToDecisionPoint(def, engineered);
};

/**
 * Replay playbook turns 0..turnIndex-1 fully, returning the state at the
 * start of turnIndex. Results are cached.
 */
const stateBeforeTurn = (def: ValidatedGameDef, baseState: GameState, turnIndex: number): GameState => {
  if (turnIndex === 0) return baseState;

  const cached = stateCache.get(turnIndex);
  if (cached !== undefined) return cached;

  // Build incrementally from the highest cached state
  let startIdx = 0;
  let current = baseState;
  for (let i = turnIndex - 1; i >= 1; i--) {
    const c = stateCache.get(i);
    if (c !== undefined) {
      startIdx = i;
      current = c;
      break;
    }
  }

  for (let i = startIdx; i < turnIndex; i++) {
    current = replayMoves(def, current, REPLAY_TURNS[i]!.moves);
    // After replaying a turn's moves, advance to the next decision point
    current = advanceToDecisionPoint(def, current);
    stateCache.set(i + 1, current);
  }

  return current;
};

/**
 * Replay to a specific decision point within the playbook.
 *
 * @param turnIndex  0-based index into REPLAY_TURNS
 * @param moveIndex  0-based index of the move within that turn that is the
 *                   MCTS decision point (moves 0..moveIndex-1 are replayed)
 */
export const replayToDecisionPoint = (
  def: ValidatedGameDef,
  baseState: GameState,
  turnIndex: number,
  moveIndex: number,
): GameState => {
  const atTurnStart = stateBeforeTurn(def, baseState, turnIndex);
  if (moveIndex === 0) return atTurnStart;
  const partialMoves = REPLAY_TURNS[turnIndex]!.moves.slice(0, moveIndex);
  const afterPartial = replayMoves(def, atTurnStart, partialMoves);
  return advanceToDecisionPoint(def, afterPartial);
};

// ---------------------------------------------------------------------------
// MCTS single-position search
// ---------------------------------------------------------------------------

export interface FitlSearchResult {
  readonly move: Move;
  readonly iterations: number;
  readonly diagnostics: MctsSearchDiagnostics;
  readonly elapsedMs: number;
}

/**
 * Run a single MCTS search at an arbitrary FITL game state.
 * Removes `timeLimitMs` from config for deterministic iteration count.
 */
export const runFitlMctsSearch = (
  def: ValidatedGameDef,
  state: GameState,
  playerId: PlayerId,
  profile: MctsBudgetProfile,
  visitor?: MctsSearchVisitor,
): FitlSearchResult => {
  const baseConfig = resolveBudgetProfile(profile);
  // Remove timeLimitMs to ensure deterministic iteration count
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { timeLimitMs: _, ...configWithoutTime } = baseConfig;
  const config = { ...configWithoutTime, diagnostics: true, ...(visitor !== undefined ? { visitor } : {}) };

  const runtime = createGameDefRuntime(def);
  const rng = createRng(BigInt(42 + 9999));
  const moves = legalMoves(def, state, undefined, runtime);
  if (moves.length < 2) {
    throw new Error(`Expected ≥2 legal moves at search state, got ${moves.length}`);
  }

  const observation = derivePlayerObservation(def, state, playerId);
  const root = createRootNode(state.playerCount);
  const poolCapacity = Math.max(config.iterations + 1, moves.length * 4);
  const pool = createNodePool(poolCapacity, state.playerCount);
  const [searchRng] = fork(rng);

  const start = Date.now();
  const result = runSearch(
    root, def, state, observation, playerId,
    config, searchRng, moves, runtime, pool,
  );
  const elapsedMs = Date.now() - start;

  const bestChild = selectRootDecision(root, playerId);

  if (result.diagnostics === undefined) {
    throw new Error('Expected diagnostics to be present (config.diagnostics was true)');
  }

  return {
    move: bestChild.move as Move,
    iterations: result.iterations,
    diagnostics: result.diagnostics,
    elapsedMs,
  };
};

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/**
 * Assert that the MCTS-chosen move's actionId is in the expected set.
 */
export const assertMoveCategory = (
  move: Move,
  expectedCategories: readonly string[],
  label: string,
): void => {
  const actionId = String(move.actionId);
  assert.ok(
    expectedCategories.includes(actionId),
    `${label}: expected actionId in [${expectedCategories.join(', ')}], got '${actionId}'`,
  );
};

/**
 * Assert that the faction's victory score does not degrade after MCTS
 * chooses a move. Tolerance allows for minor trade-offs.
 */
export const assertVictoryNonDegrading = (
  def: ValidatedGameDef,
  stateBefore: GameState,
  stateAfter: GameState,
  computeVictory: (def: GameDef, state: GameState) => number,
  tolerance: number,
  label: string,
): void => {
  const before = computeVictory(def, stateBefore);
  const after = computeVictory(def, stateAfter);
  assert.ok(
    after >= before - tolerance,
    `${label}: victory degraded beyond tolerance — before=${before}, after=${after}, tolerance=${tolerance}`,
  );
};

// ---------------------------------------------------------------------------
// FITL player ID constants
// ---------------------------------------------------------------------------

export const US_PLAYER = 0 as PlayerId;
export const ARVN_PLAYER = 1 as PlayerId;
export const NVA_PLAYER = 2 as PlayerId;
export const VC_PLAYER = 3 as PlayerId;

// ---------------------------------------------------------------------------
// Scenario descriptors
// ---------------------------------------------------------------------------

export interface MctsScenario {
  readonly label: string;
  readonly turnIndex: number;
  readonly moveIndex: number;
  readonly playerId: PlayerId;
}

export const CATEGORY_SCENARIOS: readonly MctsScenario[] = [
  { label: 'S1: T1 VC — Burning Bonze', turnIndex: 0, moveIndex: 0, playerId: VC_PLAYER },
  { label: 'S2: T1 ARVN — post NVA pass', turnIndex: 0, moveIndex: 2, playerId: ARVN_PLAYER },
  { label: 'S3: T2 NVA — Trucks', turnIndex: 1, moveIndex: 0, playerId: NVA_PLAYER },
  { label: 'S4: T3 VC — Green Berets', turnIndex: 2, moveIndex: 1, playerId: VC_PLAYER },
  { label: 'S5: T4 US — Gulf of Tonkin', turnIndex: 3, moveIndex: 0, playerId: US_PLAYER },
  { label: 'S6: T4 NVA — post US event', turnIndex: 3, moveIndex: 2, playerId: NVA_PLAYER },
  { label: 'S7: T5 VC — Brinks Hotel', turnIndex: 4, moveIndex: 0, playerId: VC_PLAYER },
  { label: 'S8: T6 ARVN — Henry Cabot Lodge', turnIndex: 5, moveIndex: 0, playerId: ARVN_PLAYER },
  { label: 'S9: T7 NVA — Booby Traps', turnIndex: 6, moveIndex: 1, playerId: NVA_PLAYER },
];

export const VICTORY_SCENARIO: MctsScenario = {
  label: 'S10: T8 US — coup pacification',
  turnIndex: 7,
  moveIndex: 2,
  playerId: US_PLAYER,
};
