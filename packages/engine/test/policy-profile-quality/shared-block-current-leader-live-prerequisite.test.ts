// @test-class: convergence-witness
// @profile-variant: us-baseline,arvn-baseline,nva-baseline,vc-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import {
  assertValidatedGameDef,
  initialState,
  asPlayerId,
  type Agent,
  type GameDef,
  type GameState,
  type Token,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { resolveActiveDeciderSeatIdForPlayer } from '../../src/kernel/microturn/types.js';
import {
  evaluateOutcomeDeltaQuery,
  runToCompetenceDecision,
  type CompetenceRunResult,
} from '../helpers/competence/index.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const PLAYER_COUNT = 4;
const PROFILE_IDS = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;

interface BlockLeaderCase {
  readonly label: string;
  readonly profileId: (typeof PROFILE_IDS)[number];
  readonly seatId: string;
  readonly playerIndex: number;
  readonly leaderSeatId: string;
  readonly seed: number;
  readonly support: string;
  readonly expectedActionId: string;
  readonly prepare?: (def: GameDef, state: GameState) => GameState;
}

const CASES: readonly BlockLeaderCase[] = [
  {
    label: 'US Train/Pacify reduces a VC leader margin',
    profileId: 'us-baseline',
    seatId: 'us',
    playerIndex: 0,
    leaderSeatId: 'vc',
    seed: 1,
    support: 'activeOpposition',
    expectedActionId: 'train',
    prepare: prepareSingleSpaceUsPacify,
  },
  {
    label: 'ARVN Govern reduces a US leader margin',
    profileId: 'arvn-baseline',
    seatId: 'arvn',
    playerIndex: 1,
    leaderSeatId: 'us',
    seed: 210_001,
    support: 'activeSupport',
    expectedActionId: 'govern',
  },
  {
    label: 'NVA Terror reduces a US leader margin',
    profileId: 'nva-baseline',
    seatId: 'nva',
    playerIndex: 2,
    leaderSeatId: 'us',
    seed: 210_001,
    support: 'activeSupport',
    expectedActionId: 'terror',
    prepare: prepareSingleSpaceNvaTerror,
  },
  {
    label: 'VC Terror reduces a US leader margin',
    profileId: 'vc-baseline',
    seatId: 'vc',
    playerIndex: 3,
    leaderSeatId: 'us',
    seed: 210_001,
    support: 'activeSupport',
    expectedActionId: 'terror',
  },
];

describe('Spec 210 shared.blockCurrentLeader live prerequisite witness', () => {
  for (const entry of CASES) {
    it(entry.label, () => {
      const gameDef = assertValidatedGameDef(getFitlProductionFixture().gameDef);
      const agents = createFitlPolicyAgents();
      const baseState = initialState(gameDef, entry.seed, PLAYER_COUNT).state;
      const state = prepareFactionTurnState(gameDef, entry, baseState);
      const result = runToBlockLeaderDecision(gameDef, agents, entry, state);
      const before = leaderMargin(gameDef, result.preState, entry.leaderSeatId);
      const after = leaderMargin(gameDef, result.postState, entry.leaderSeatId);
      assert.equal(result.selectedDecision.kind, 'actionSelection');
      const selectedActionId = String(result.selectedDecision.actionId);
      const activeDoctrines = result.agentDecision?.plan?.activeDoctrines ?? [];
      const passed = selectedActionId === entry.expectedActionId
        && activeDoctrines.includes('shared.blockCurrentLeader')
        && after < before;

      emitPolicyProfileQualityRecord({
        file: TEST_FILE,
        variantId: entry.profileId,
        seed: entry.seed,
        passed,
        stopReason: result.stopReason,
        decisions: result.decisions.length,
      });

      assert.equal(selectedActionId, entry.expectedActionId);
      assert.ok(
        activeDoctrines.includes('shared.blockCurrentLeader'),
        `${entry.profileId} should activate shared.blockCurrentLeader`,
      );
      assert.ok(
        after < before,
        `${entry.profileId} should reduce ${entry.leaderSeatId} leader margin, before=${before}, after=${after}`,
      );
    });
  }
});

function createFitlPolicyAgents(): readonly Agent[] {
  return PROFILE_IDS.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'verbose' }));
}

function prepareFactionTurnState(def: GameDef, entry: BlockLeaderCase, state: GameState): GameState {
  const marked = withEveryZoneSupportMarker(def, state, entry.support);
  const prepared = entry.prepare?.(def, marked) ?? marked;
  return setSingleEligibleFactionTurn(def, prepared, entry.seatId, entry.playerIndex);
}

function runToBlockLeaderDecision(
  def: ValidatedGameDef,
  agents: readonly Agent[],
  entry: BlockLeaderCase,
  bootstrapState: GameState,
): CompetenceRunResult {
  return runToCompetenceDecision({
    def,
    seed: entry.seed,
    agents,
    playerCount: PLAYER_COUNT,
    bootstrapState,
    maxTurns: 1,
    microturnBound: 80,
    advanceUntil: ({ microturn }) =>
      String(microturn.seatId) === entry.seatId && microturn.kind === 'actionSelection',
  });
}

function withEveryZoneSupportMarker(def: GameDef, state: GameState, support: string): GameState {
  return {
    ...state,
    markers: {
      ...state.markers,
      ...Object.fromEntries(def.zones.map((zone) => [
        zone.id,
        {
          ...(state.markers[zone.id] ?? {}),
          supportOpposition: support,
        },
      ])),
    },
  };
}

function setSingleEligibleFactionTurn(
  def: GameDef,
  state: GameState,
  seatId: string,
  playerIndex: number,
): GameState {
  assert.equal(state.turnOrderState?.type, 'cardDriven');
  return {
    ...state,
    activePlayer: asPlayerId(playerIndex),
    activeDeciderSeatId: resolveActiveDeciderSeatIdForPlayer(def, playerIndex),
    turnOrderState: {
      ...state.turnOrderState,
      runtime: {
        ...state.turnOrderState.runtime,
        currentCard: {
          ...state.turnOrderState.runtime.currentCard,
          firstEligible: seatId,
          secondEligible: null,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
  };
}

function prepareSingleSpaceNvaTerror(def: GameDef, state: GameState): GameState {
  const withoutMapNva = moveFactionBoardTokensToZone(def, state, 'NVA', 'available-NVA:none');
  return moveOneToken(withoutMapNva, 'available-NVA:none', 'saigon:none', (token) =>
    token.props.faction === 'NVA' && token.props.type === 'guerrilla');
}

function prepareSingleSpaceUsPacify(def: GameDef, state: GameState): GameState {
  const withoutMapUs = moveFactionBoardTokensToZone(def, state, 'US', 'available-US:none');
  const withTroop = moveOneToken(withoutMapUs, 'available-US:none', 'saigon:none', (token) =>
    token.props.faction === 'US' && token.props.type === 'troops');
  const withBase = moveOneToken(withTroop, 'available-US:none', 'saigon:none', (token) =>
    token.props.faction === 'US' && token.props.type === 'base');
  return moveAvailableUsIrregularsToCasualties(withBase);
}

function moveFactionBoardTokensToZone(def: GameDef, state: GameState, faction: string, destination: string): GameState {
  const boardZoneIds = new Set(def.zones.filter((zone) => zone.zoneKind === 'board').map((zone) => zone.id));
  const zones: Record<string, readonly Token[]> = { ...state.zones };
  const moved: Token[] = [];

  for (const zoneId of boardZoneIds) {
    const kept: Token[] = [];
    for (const token of zones[zoneId] ?? []) {
      if (token.props.faction === faction) {
        moved.push(token);
      } else {
        kept.push(token);
      }
    }
    zones[zoneId] = kept;
  }

  zones[destination] = [...(zones[destination] ?? []), ...moved];
  return { ...state, zones };
}

function moveOneToken(
  state: GameState,
  source: string,
  destination: string,
  predicate: (token: Token) => boolean,
): GameState {
  const token = (state.zones[source] ?? []).find(predicate);
  assert.ok(token, `expected token in ${source}`);
  return {
    ...state,
    zones: {
      ...state.zones,
      [source]: (state.zones[source] ?? []).filter((entry) => entry.id !== token.id),
      [destination]: [...(state.zones[destination] ?? []), token],
    },
  };
}

function moveAvailableUsIrregularsToCasualties(state: GameState): GameState {
  const available = state.zones['available-US:none'] ?? [];
  const irregulars = available.filter((token) => token.props.faction === 'US' && token.props.type === 'irregular');
  const retained = available.filter((token) => !(token.props.faction === 'US' && token.props.type === 'irregular'));
  return {
    ...state,
    zones: {
      ...state.zones,
      'available-US:none': retained,
      'casualties-US:none': [...(state.zones['casualties-US:none'] ?? []), ...irregulars],
    },
  };
}

function leaderMargin(def: GameDef, state: GameState, seat: string): number {
  const value = evaluateOutcomeDeltaQuery(def, state, { kind: 'terminalVictoryMargin', seat });
  assert.equal(typeof value, 'number');
  return value as number;
}
