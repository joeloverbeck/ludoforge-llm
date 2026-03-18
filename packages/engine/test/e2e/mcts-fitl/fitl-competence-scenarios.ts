import type { MctsBudgetProfile } from '../../../src/agents/index.js';
import type { GameState, Token, PlayerId, ValidatedGameDef } from '../../../src/kernel/index.js';

import {
  arvnControlMaintain,
  arvnGovern,
  arvnSweepRaid,
  arvnTrainCubes,
  budgetRank,
  categoryCompetence,
  monsoonAwareness,
  nvaAttackConditions,
  nvaControlGrowth,
  nvaMarchSouthward,
  nvaRallyTrailImprove,
  resourceDiscipline,
  usAssaultRemoval,
  usForcePreservation,
  usPacification,
  usSupportGrowth,
  usSweepActivation,
  vcBaseExpansion,
  vcOppositionGrowth,
  vcRallyQuality,
  vcTaxEfficiency,
  vcTerrorTarget,
  victoryDefense,
  victoryProgress,
  type CompetenceEvaluator,
} from './fitl-competence-evaluators.js';
import {
  ARVN_PLAYER,
  CATEGORY_SCENARIOS,
  computeArvnVictory,
  computeNvaVictory,
  computeUsVictory,
  computeVcVictory,
  engineerScenarioState,
  NVA_PLAYER,
  replayToDecisionPoint,
  US_PLAYER,
  VC_PLAYER,
  VICTORY_SCENARIO,
} from './fitl-mcts-test-helpers.js';

export interface CompetenceScenario {
  readonly id: string;
  readonly label: string;
  readonly turnIndex: number;
  readonly moveIndex: number;
  readonly playerId: PlayerId;
  readonly budgets: readonly MctsBudgetProfile[];
  readonly evaluators: readonly CompetenceEvaluator[];
  readonly engineeredState?: (def: ValidatedGameDef, baseState: GameState) => GameState;
}

const E2E_COMPETENCE_BUDGETS = ['interactive'] as const satisfies readonly MctsBudgetProfile[];

const getTokenPieceType = (token: Token): string | null => {
  const pieceType = token.props.type;
  return typeof pieceType === 'string' ? pieceType : null;
};

const getZoneTokens = (
  state: GameState,
  overrides: Readonly<Record<string, readonly Token[]>>,
  zoneId: string,
): readonly Token[] => overrides[zoneId] ?? state.zones[zoneId] ?? [];

const takeMatchingTokens = (
  tokens: readonly Token[],
  predicate: (token: Token) => boolean,
  count: number,
): { readonly taken: readonly Token[]; readonly remaining: readonly Token[] } => {
  const taken: Token[] = [];
  const remaining: Token[] = [];

  for (const token of tokens) {
    if (taken.length < count && predicate(token)) {
      taken.push(token);
      continue;
    }
    remaining.push(token);
  }

  if (taken.length !== count) {
    throw new Error(`Expected to take ${count} matching tokens, took ${taken.length}`);
  }

  return { taken, remaining };
};

const moveTokens = (
  state: GameState,
  overrides: Record<string, readonly Token[]>,
  fromZoneId: string,
  toZoneId: string,
  count: number,
  predicate: (token: Token) => boolean,
): void => {
  const sourceTokens = getZoneTokens(state, overrides, fromZoneId);
  const targetTokens = getZoneTokens(state, overrides, toZoneId);
  const { taken, remaining } = takeMatchingTokens(sourceTokens, predicate, count);
  overrides[fromZoneId] = remaining;
  overrides[toZoneId] = [...targetTokens, ...taken];
};

const getPopulationZones = (
  def: ValidatedGameDef,
): readonly string[] => def.zones
  .filter((zone) =>
    (zone.zoneKind === 'board' || zone.category === 'city' || zone.category === 'province')
    && typeof zone.attributes?.population === 'number'
    && zone.attributes.population > 0
    && zone.attributes.country === 'southVietnam')
  .sort((left, right) =>
    Number(right.attributes?.population ?? 0) - Number(left.attributes?.population ?? 0))
  .map((zone) => zone.id);

const tuneMarkerScore = (
  def: ValidatedGameDef,
  state: GameState,
  computeVictory: (def: ValidatedGameDef, state: GameState) => number,
  targetScore: number,
  candidateZoneIds: readonly string[],
  candidateMarkerStates: readonly string[],
): GameState => {
  let workingState = state;
  const markerOverrides: Record<string, Readonly<Record<string, string>>> = {};

  for (const zoneId of candidateZoneIds) {
    const currentScore = computeVictory(def, workingState);
    if (currentScore >= targetScore) {
      break;
    }

    let bestState: GameState | null = null;
    let bestMarkerState: string | null = null;
    let bestScore = currentScore;

    for (const markerState of candidateMarkerStates) {
      const candidate = engineerScenarioState(state, {
        markers: {
          ...markerOverrides,
          [zoneId]: { supportOpposition: markerState },
        },
      });
      const score = computeVictory(def, candidate);
      if (score > bestScore && score <= targetScore) {
        bestState = candidate;
        bestMarkerState = markerState;
        bestScore = score;
      }
    }

    if (bestState !== null && bestMarkerState !== null) {
      markerOverrides[zoneId] = { supportOpposition: bestMarkerState };
      workingState = bestState;
    }
  }

  return workingState;
};

const buildFromReplay = (
  turnIndex: number,
  moveIndex: number,
  transform: (def: ValidatedGameDef, state: GameState) => GameState,
): ((def: ValidatedGameDef, baseState: GameState) => GameState) =>
  (def, baseState) => transform(def, replayToDecisionPoint(def, baseState, turnIndex, moveIndex));

const buildS11NearWinVcState = buildFromReplay(CATEGORY_SCENARIOS[6]!.turnIndex, CATEGORY_SCENARIOS[6]!.moveIndex, (
  def,
  state,
) => {
  const zones: Record<string, readonly Token[]> = {};
  moveTokens(
    state,
    zones,
    'available-VC:none',
    'saigon:none',
    2,
    (token) => token.props.faction === 'VC' && getTokenPieceType(token) === 'guerrilla',
  );
  moveTokens(
    state,
    zones,
    'available-VC:none',
    'tay-ninh:none',
    1,
    (token) => token.props.faction === 'VC' && getTokenPieceType(token) === 'base',
  );

  const withPieces = engineerScenarioState(state, {
    globalVars: { vcResources: 3 },
    zones,
    markers: {
      'saigon:none': { supportOpposition: 'activeSupport' },
    },
  });

  return tuneMarkerScore(
    def,
    withPieces,
    computeVcVictory,
    33,
    getPopulationZones(def).filter((zoneId) => zoneId !== 'saigon:none'),
    ['activeOpposition', 'passiveOpposition'],
  );
});

const buildS12ResourceStarvedNvaState = buildFromReplay(CATEGORY_SCENARIOS[5]!.turnIndex, CATEGORY_SCENARIOS[5]!.moveIndex, (
  _def,
  state,
) => {
  const zones: Record<string, readonly Token[]> = {};
  const troopDestinations = [
    'quang-tri-thua-thien:none',
    'tay-ninh:none',
    'binh-dinh:none',
  ] as const;
  for (const zoneId of troopDestinations) {
    moveTokens(
      state,
      zones,
      'available-NVA:none',
      zoneId,
      5,
      (token) => token.props.faction === 'NVA' && getTokenPieceType(token) === 'troops',
    );
  }

  return engineerScenarioState(state, {
    globalVars: {
      nvaResources: 0,
      trail: 2,
    },
    zones,
  });
});

const buildS13DefensiveUsState = buildFromReplay(CATEGORY_SCENARIOS[4]!.turnIndex, CATEGORY_SCENARIOS[4]!.moveIndex, (
  def,
  state,
) => {
  const zones: Record<string, readonly Token[]> = {};
  const usAvailable = state.zones['available-US:none'] ?? [];
  zones['available-US:none'] = usAvailable.slice(0, 3);
  zones['saigon:none'] = [...(state.zones['saigon:none'] ?? []), ...usAvailable.slice(3, 9)];
  zones['da-nang:none'] = [...(state.zones['da-nang:none'] ?? []), ...usAvailable.slice(9, 15)];
  zones['can-tho:none'] = [...(state.zones['can-tho:none'] ?? []), ...usAvailable.slice(15)];

  moveTokens(
    state,
    zones,
    'available-NVA:none',
    'binh-dinh:none',
    6,
    (token) => token.props.faction === 'NVA' && getTokenPieceType(token) === 'troops',
  );
  moveTokens(
    state,
    zones,
    'available-NVA:none',
    'quang-tri-thua-thien:none',
    6,
    (token) => token.props.faction === 'NVA' && getTokenPieceType(token) === 'troops',
  );

  const defended = engineerScenarioState(state, {
    zones,
    markers: {
      'binh-dinh:none': { supportOpposition: 'passiveSupport' },
      'quang-tri-thua-thien:none': { supportOpposition: 'passiveSupport' },
    },
  });

  return tuneMarkerScore(
    def,
    defended,
    computeUsVictory,
    48,
    getPopulationZones(def),
    ['activeSupport', 'passiveSupport'],
  );
});

const buildS14PreCoupArvnState = buildFromReplay(CATEGORY_SCENARIOS[7]!.turnIndex, CATEGORY_SCENARIOS[7]!.moveIndex, (
  def,
  state,
) => {
  const lookaheadZoneId = def.turnOrder?.type === 'cardDriven'
    ? def.turnOrder.config.turnFlow.cardLifecycle.lookahead
    : null;
  if (lookaheadZoneId === null) {
    throw new Error('Expected FITL turn flow to expose a lookahead zone');
  }
  const lookahead = state.zones[lookaheadZoneId]?.[0];
  if (lookahead === undefined) {
    throw new Error('Expected lookahead zone to contain a card token');
  }

  return engineerScenarioState(state, {
    zones: {
      [lookaheadZoneId]: [{
        ...lookahead,
        props: {
          ...lookahead.props,
          isCoup: true,
        },
      }],
    },
  });
});

const buildS15LateGameNvaState = buildFromReplay(CATEGORY_SCENARIOS[8]!.turnIndex, CATEGORY_SCENARIOS[8]!.moveIndex, (
  _def,
  state,
) => {
  const zones: Record<string, readonly Token[]> = {};
  moveTokens(
    state,
    zones,
    'available-NVA:none',
    'quang-tri-thua-thien:none',
    8,
    (token) => token.props.faction === 'NVA' && getTokenPieceType(token) === 'troops',
  );
  moveTokens(
    state,
    zones,
    'available-NVA:none',
    'tay-ninh:none',
    8,
    (token) => token.props.faction === 'NVA' && getTokenPieceType(token) === 'troops',
  );
  moveTokens(
    state,
    zones,
    'available-NVA:none',
    'binh-dinh:none',
    4,
    (token) => token.props.faction === 'NVA' && getTokenPieceType(token) === 'troops',
  );
  moveTokens(
    state,
    zones,
    'available-NVA:none',
    'quang-tri-thua-thien:none',
    4,
    (token) => token.props.faction === 'NVA' && getTokenPieceType(token) === 'guerrilla',
  );
  moveTokens(
    state,
    zones,
    'available-NVA:none',
    'tay-ninh:none',
    3,
    (token) => token.props.faction === 'NVA' && getTokenPieceType(token) === 'guerrilla',
  );
  moveTokens(
    state,
    zones,
    'available-NVA:none',
    'binh-dinh:none',
    3,
    (token) => token.props.faction === 'NVA' && getTokenPieceType(token) === 'guerrilla',
  );

  return engineerScenarioState(state, {
    globalVars: {
      trail: 4,
    },
    zones,
  });
});

export const COMPETENCE_SCENARIOS: readonly CompetenceScenario[] = [
  {
    id: 'S1',
    ...CATEGORY_SCENARIOS[0]!,
    budgets: E2E_COMPETENCE_BUDGETS,
    evaluators: [
      categoryCompetence(['event', 'rally', 'march', 'attack', 'terror', 'tax', 'ambushVc']),
      victoryProgress(computeVcVictory, 35, 2),
      vcRallyQuality(),
      vcOppositionGrowth(),
      vcBaseExpansion(),
    ],
  },
  {
    id: 'S2',
    ...CATEGORY_SCENARIOS[1]!,
    budgets: E2E_COMPETENCE_BUDGETS,
    evaluators: [
      categoryCompetence(['train', 'patrol', 'sweep', 'govern', 'transport', 'raid']),
      victoryProgress(computeArvnVictory, 50, 3),
      arvnTrainCubes(),
      arvnGovern(),
      arvnControlMaintain(),
    ],
  },
  {
    id: 'S3',
    ...CATEGORY_SCENARIOS[2]!,
    budgets: E2E_COMPETENCE_BUDGETS,
    evaluators: [
      categoryCompetence(['event', 'rally', 'march', 'terror', 'infiltrate']),
      victoryProgress(computeNvaVictory, 18, 2),
      nvaRallyTrailImprove(),
      nvaControlGrowth(),
    ],
  },
  {
    id: 'S4',
    ...CATEGORY_SCENARIOS[3]!,
    budgets: E2E_COMPETENCE_BUDGETS,
    evaluators: [
      categoryCompetence(['rally', 'terror', 'tax', 'march', 'ambushVc']),
      victoryProgress(computeVcVictory, 35, 2),
      vcRallyQuality(),
      vcBaseExpansion(),
      vcTaxEfficiency(),
    ],
  },
  {
    id: 'S5',
    ...CATEGORY_SCENARIOS[4]!,
    budgets: E2E_COMPETENCE_BUDGETS,
    evaluators: [
      categoryCompetence(['event', 'train', 'patrol', 'sweep', 'assault', 'advise', 'airLift', 'airStrike']),
      victoryProgress(computeUsVictory, 50, 3),
      usSupportGrowth(),
    ],
  },
  {
    id: 'S6',
    ...CATEGORY_SCENARIOS[5]!,
    budgets: E2E_COMPETENCE_BUDGETS,
    evaluators: [
      categoryCompetence(['rally', 'march', 'terror', 'infiltrate']),
      victoryProgress(computeNvaVictory, 18, 2),
      nvaMarchSouthward(),
      nvaControlGrowth(),
    ],
  },
  {
    id: 'S7',
    ...CATEGORY_SCENARIOS[6]!,
    budgets: E2E_COMPETENCE_BUDGETS,
    evaluators: [
      categoryCompetence(['event', 'terror', 'rally', 'tax', 'march', 'ambushVc']),
      victoryProgress(computeVcVictory, 35, 2),
      vcTerrorTarget(),
      vcOppositionGrowth(),
    ],
  },
  {
    id: 'S8',
    ...CATEGORY_SCENARIOS[7]!,
    budgets: E2E_COMPETENCE_BUDGETS,
    evaluators: [
      categoryCompetence(['event', 'train', 'patrol', 'sweep', 'assault', 'govern', 'transport', 'raid']),
      victoryProgress(computeArvnVictory, 50, 3),
      arvnSweepRaid(),
      arvnControlMaintain(),
    ],
  },
  {
    id: 'S9',
    ...CATEGORY_SCENARIOS[8]!,
    budgets: E2E_COMPETENCE_BUDGETS,
    evaluators: [
      categoryCompetence(['attack', 'rally', 'ambushNva', 'bombard']),
      victoryProgress(computeNvaVictory, 18, 2),
      nvaAttackConditions(),
      nvaControlGrowth(),
    ],
  },
  {
    id: 'S10',
    ...VICTORY_SCENARIO,
    budgets: E2E_COMPETENCE_BUDGETS,
    evaluators: [
      categoryCompetence(['coupPacifyUS']),
      victoryProgress(computeUsVictory, 50, 3),
      usPacification(),
      usSupportGrowth(),
    ],
  },
  {
    id: 'S11',
    label: 'S11: Near-win VC',
    turnIndex: CATEGORY_SCENARIOS[6]!.turnIndex,
    moveIndex: CATEGORY_SCENARIOS[6]!.moveIndex,
    playerId: VC_PLAYER,
    budgets: E2E_COMPETENCE_BUDGETS,
    engineeredState: buildS11NearWinVcState,
    evaluators: [
      categoryCompetence(['terror', 'event']),
      victoryProgress(computeVcVictory, 35, 0),
      vcTerrorTarget(),
      vcOppositionGrowth(),
    ],
  },
  {
    id: 'S12',
    label: 'S12: NVA resource-starved',
    turnIndex: CATEGORY_SCENARIOS[5]!.turnIndex,
    moveIndex: CATEGORY_SCENARIOS[5]!.moveIndex,
    playerId: NVA_PLAYER,
    budgets: E2E_COMPETENCE_BUDGETS,
    engineeredState: buildS12ResourceStarvedNvaState,
    evaluators: [
      categoryCompetence(['pass']),
      resourceDiscipline(),
    ],
  },
  {
    id: 'S13',
    label: 'S13: US defensive',
    turnIndex: CATEGORY_SCENARIOS[4]!.turnIndex,
    moveIndex: CATEGORY_SCENARIOS[4]!.moveIndex,
    playerId: US_PLAYER,
    budgets: E2E_COMPETENCE_BUDGETS,
    engineeredState: buildS13DefensiveUsState,
    evaluators: [
      categoryCompetence(['sweep', 'assault', 'airStrike']),
      victoryDefense(computeUsVictory, computeNvaVictory, 50, 18, 2),
      usSweepActivation(),
      usAssaultRemoval(),
      usForcePreservation(),
    ],
  },
  {
    id: 'S14',
    label: 'S14: ARVN pre-Coup',
    turnIndex: CATEGORY_SCENARIOS[7]!.turnIndex,
    moveIndex: CATEGORY_SCENARIOS[7]!.moveIndex,
    playerId: ARVN_PLAYER,
    budgets: E2E_COMPETENCE_BUDGETS,
    engineeredState: buildS14PreCoupArvnState,
    evaluators: [
      categoryCompetence(['train', 'govern', 'event', 'pass']),
      monsoonAwareness(),
      arvnTrainCubes(),
      arvnGovern(),
      arvnControlMaintain(),
    ],
  },
  {
    id: 'S15',
    label: 'S15: NVA late-game blitz',
    turnIndex: CATEGORY_SCENARIOS[8]!.turnIndex,
    moveIndex: CATEGORY_SCENARIOS[8]!.moveIndex,
    playerId: NVA_PLAYER,
    budgets: E2E_COMPETENCE_BUDGETS,
    engineeredState: buildS15LateGameNvaState,
    evaluators: [
      categoryCompetence(['march', 'rally', 'attack']),
      victoryProgress(computeNvaVictory, 18, 1),
      nvaMarchSouthward(),
      nvaControlGrowth(),
    ],
  },
];
