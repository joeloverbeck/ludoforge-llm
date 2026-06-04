import * as assert from 'node:assert/strict';

import { PolicyAgent } from '../../src/agents/index.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';
import {
  assertValidatedGameDef,
  initialState,
  asPlayerId,
  asTokenId,
  type Agent,
  type Decision,
  type GameDef,
  type GameState,
  type Token,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { resolveActiveDeciderSeatIdForPlayer } from '../../src/kernel/microturn/types.js';
import {
  assertAdversarialAlternativeAvoided,
  assertOutcomeDeltas,
  assertPlanTraceChain,
  assertPreviewStatuses,
  assertReplayIdentity,
  canonicalStateChanged,
  runToCompetenceDecision,
  type CompetenceRunResult,
  type OutcomeDeltaAssertion,
  type PreviewRefExpectation,
} from '../helpers/competence/index.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const PLAYER_COUNT = 4;
const PROFILE_IDS = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const PASS_TRAP_STABLE_MOVE_KEY = 'pass|{}|noCompound|false|pass';
const LEADER_OPTION_DELTA_REF = 'preview.option.delta.victory.currentMargin.role:currentLeader';
const SELF_MARGIN_REF = 'victoryCurrentMargin.currentMargin.self';
const NEAR_COUP_DOCTRINE_ID = 'shared.nearCoupConcreteSwing';
const MONSOON_DOCTRINE_ID = 'shared.monsoonOperationalRestriction';

export type FitlProfileId = (typeof PROFILE_IDS)[number];

export interface FitlCompetenceCase {
  readonly testFile: string;
  readonly profileId: FitlProfileId;
  readonly seatId: string;
  readonly playerIndex: number;
  readonly seed: number;
  readonly expectedRootStableMoveKey?: string;
  readonly leaderMarginAssertion?: OutcomeDeltaAssertion;
  readonly prepareState: (def: GameDef, state: GameState) => GameState;
}

export interface FitlImmediateWinCase {
  readonly testFile: string;
  readonly profileId: FitlProfileId;
  readonly seatId: string;
  readonly playerIndex: number;
  readonly seed: number;
  readonly expectedRootStableMoveKey: string;
  readonly selfMarginAssertion: OutcomeDeltaAssertion;
  readonly prepareState: (def: GameDef, state: GameState) => GameState;
}

export interface FitlNearCoupCase {
  readonly testFile: string;
  readonly profileId: FitlProfileId;
  readonly seatId: string;
  readonly playerIndex: number;
  readonly seed: number;
  readonly expectedRootStableMoveKey: string;
  readonly outcomeAssertions: readonly OutcomeDeltaAssertion[];
  readonly prepareState?: (def: GameDef, state: GameState) => GameState;
}

export interface FitlMonsoonPairCase {
  readonly testFile: string;
  readonly profileId: FitlProfileId;
  readonly seatId: string;
  readonly playerIndex: number;
  readonly seed: number;
  readonly clearRootStableMoveKey?: string;
  readonly clearTemplateId?: string;
  readonly monsoonRootStableMoveKey?: string;
  readonly monsoonTemplateId?: string;
  readonly suppressedTemplateIds: readonly string[];
  readonly prepareState?: (def: GameDef, state: GameState) => GameState;
  readonly clearOutcomeAssertions?: readonly OutcomeDeltaAssertion[];
  readonly monsoonOutcomeAssertions?: readonly OutcomeDeltaAssertion[];
}

export interface FitlRunnableCase {
  readonly seatId: string;
  readonly playerIndex: number;
  readonly seed: number;
  readonly prepareState: (def: GameDef, state: GameState) => GameState;
}

export function assertFitlExecutedOutcomeCase(input: FitlCompetenceCase): void {
  const def = loadFitlProductionDef();
  const run = (): CompetenceRunResult => runFitlCompetenceCase(def, input);
  const result = run();
  const outcomeDeltas = input.leaderMarginAssertion === undefined
    ? []
    : assertOutcomeDeltas({
      def,
      before: result.preState,
      after: result.postState,
      assertions: [input.leaderMarginAssertion],
    });
  const passed = canonicalStateChanged(result.preState, result.postState)
    && (input.leaderMarginAssertion === undefined
      || outcomeDeltas.every((delta) => typeof delta.delta === 'number' && delta.delta < 0));

  emitPolicyProfileQualityRecord({
    file: input.testFile,
    variantId: input.profileId,
    seed: input.seed,
    passed,
    stopReason: result.stopReason,
    decisions: result.decisions.length,
  });

  assert.ok(canonicalStateChanged(result.preState, result.postState), 'expected selected live turn to change state');
  if (input.expectedRootStableMoveKey === undefined) {
    assert.ok(
      result.agentDecision?.plan?.activeDoctrines.includes('shared.blockCurrentLeader'),
      'expected shared.blockCurrentLeader to remain active',
    );
  } else {
    assertPlanTraceChain({
      def,
      result,
      expected: {
        activeDoctrine: 'shared.blockCurrentLeader',
        selectedRootStableMoveKey: input.expectedRootStableMoveKey,
      },
    });
  }
  assertAdversarialAlternativeAvoided({
    def,
    result,
    trapStableMoveKeys: [PASS_TRAP_STABLE_MOVE_KEY],
  });
  assertLeaderOptionPreviewIntegrity(result);
  assertReplayIdentity({
    def,
    runFixture: run,
    ...(input.leaderMarginAssertion === undefined ? {} : { outcomeDeltaAssertions: [input.leaderMarginAssertion] }),
  });
}

export function assertFitlImmediateWinCase(input: FitlImmediateWinCase): void {
  const def = loadFitlProductionDef();
  const run = (): CompetenceRunResult => runFitlCompetenceCase(def, input);
  const result = run();
  const outcomeDeltas = assertOutcomeDeltas({
    def,
    before: result.preState,
    after: result.postState,
    assertions: [input.selfMarginAssertion],
  });
  const selectedSelfMargin = outcomeDeltas[0]?.after;
  const passed = canonicalStateChanged(result.preState, result.postState)
    && typeof selectedSelfMargin === 'number'
    && selectedSelfMargin >= 0;

  emitPolicyProfileQualityRecord({
    file: input.testFile,
    variantId: input.profileId,
    seed: input.seed,
    passed,
    stopReason: result.stopReason,
    decisions: result.decisions.length,
  });

  assert.ok(canonicalStateChanged(result.preState, result.postState), 'expected selected live turn to change state');
  assertImmediateWinTrace(def, result, input.expectedRootStableMoveKey);
  assertAdversarialAlternativeAvoided({
    def,
    result,
    trapStableMoveKeys: [PASS_TRAP_STABLE_MOVE_KEY],
  });
  assertSelectedSelfMarginTrace(result, input.expectedRootStableMoveKey);
  assertReplayIdentity({
    def,
    runFixture: run,
    outcomeDeltaAssertions: [input.selfMarginAssertion],
  });
}

export function assertFitlNearCoupCase(input: FitlNearCoupCase): void {
  const def = loadFitlProductionDef();
  const run = (): CompetenceRunResult => runFitlCompetenceCase(def, {
    ...input,
    prepareState: (caseDef, state) => {
      const prepared = withCoupLookahead(caseDef, state);
      return input.prepareState === undefined ? prepared : input.prepareState(caseDef, prepared);
    },
  });
  const result = run();
  const outcomeDeltas = assertOutcomeDeltas({
    def,
    before: result.preState,
    after: result.postState,
    assertions: input.outcomeAssertions,
  });

  emitPolicyProfileQualityRecord({
    file: input.testFile,
    variantId: input.profileId,
    seed: input.seed,
    passed: canonicalStateChanged(result.preState, result.postState),
    stopReason: result.stopReason,
    decisions: result.decisions.length,
  });

  assert.ok(canonicalStateChanged(result.preState, result.postState), 'expected selected live turn to change state');
  assertPolicySelectedRoot(def, result, NEAR_COUP_DOCTRINE_ID, input.expectedRootStableMoveKey);
  assertAdversarialAlternativeAvoided({
    def,
    result,
    trapStableMoveKeys: [PASS_TRAP_STABLE_MOVE_KEY],
  });
  assertReplayIdentity({
    def,
    runFixture: run,
    outcomeDeltaAssertions: input.outcomeAssertions,
  });
  assert.ok(outcomeDeltas.length > 0, 'expected near-Coup outcome assertions');
}

export function assertFitlMonsoonPairCase(input: FitlMonsoonPairCase): void {
  const def = loadFitlProductionDef();
  const runClear = (): CompetenceRunResult => runFitlCompetenceCase(def, {
    ...input,
    prepareState: (caseDef, state) => withNonCoupLookahead(
      caseDef,
      input.prepareState === undefined ? state : input.prepareState(caseDef, state),
    ),
  });
  const runMonsoon = (): CompetenceRunResult => runFitlCompetenceCase(def, {
    ...input,
    prepareState: (caseDef, state) => withCoupLookahead(
      caseDef,
      input.prepareState === undefined ? state : input.prepareState(caseDef, state),
    ),
  });
  const clear = runClear();
  const monsoon = runMonsoon();

  if (input.clearOutcomeAssertions !== undefined) {
    assertOutcomeDeltas({
      def,
      before: clear.preState,
      after: clear.postState,
      assertions: input.clearOutcomeAssertions,
    });
  }
  if (input.monsoonOutcomeAssertions !== undefined) {
    assertOutcomeDeltas({
      def,
      before: monsoon.preState,
      after: monsoon.postState,
      assertions: input.monsoonOutcomeAssertions,
    });
  }

  emitPolicyProfileQualityRecord({
    file: input.testFile,
    variantId: input.profileId,
    seed: input.seed,
    passed: canonicalStateChanged(clear.preState, clear.postState)
      && canonicalStateChanged(monsoon.preState, monsoon.postState),
    stopReason: monsoon.stopReason,
    decisions: clear.decisions.length + monsoon.decisions.length,
  });

  assertMonsoonClearBranch(def, clear, input);
  assertMonsoonRestrictedBranch(def, monsoon, input);
  assertReplayIdentity({
    def,
    runFixture: runClear,
    ...(input.clearOutcomeAssertions === undefined ? {} : { outcomeDeltaAssertions: input.clearOutcomeAssertions }),
  });
  assertReplayIdentity({
    def,
    runFixture: runMonsoon,
    ...(input.monsoonOutcomeAssertions === undefined ? {} : { outcomeDeltaAssertions: input.monsoonOutcomeAssertions }),
  });
  assertPreviewStatuses({ result: clear });
  assertPreviewStatuses({ result: monsoon });
}

export function withEveryZoneSupportMarker(def: GameDef, state: GameState, support: string): GameState {
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

export function moveFactionBoardTokensToZone(
  def: GameDef,
  state: GameState,
  faction: string,
  destination: string,
): GameState {
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

export function moveOneToken(
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

export function moveAvailableUsIrregularsToCasualties(state: GameState): GameState {
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

export function withCoupLookahead(def: GameDef, state: GameState): GameState {
  const coupCard = def.eventDecks
    ?.flatMap((deck) => deck.cards)
    .find((card) => card.tags?.includes('coup'));
  assert.ok(coupCard, 'expected FITL event deck to contain a Coup card');
  return {
    ...state,
    zones: {
      ...state.zones,
      'lookahead:none': [
        {
          id: asTokenId(`spec-210-near-coup-lookahead-${String(coupCard.id)}`),
          type: 'card',
          props: { cardId: String(coupCard.id) },
        },
      ],
    },
  };
}

function withNonCoupLookahead(def: GameDef, state: GameState): GameState {
  const nonCoupCard = def.eventDecks
    ?.flatMap((deck) => deck.cards)
    .find((card) => !(card.tags ?? []).includes('coup'));
  assert.ok(nonCoupCard, 'expected FITL event deck to contain a non-Coup card');
  return {
    ...state,
    zones: {
      ...state.zones,
      'lookahead:none': [
        {
          id: asTokenId(`spec-210-clear-lookahead-${String(nonCoupCard.id)}`),
          type: 'card',
          props: { cardId: String(nonCoupCard.id) },
        },
      ],
    },
  };
}

export function loadFitlProductionDef(): ValidatedGameDef {
  return assertValidatedGameDef(getFitlProductionFixture().gameDef);
}

export function runFitlCompetenceCase(def: ValidatedGameDef, input: FitlRunnableCase): CompetenceRunResult {
  const baseState = initialState(def, input.seed, PLAYER_COUNT).state;
  const prepared = setSingleEligibleFactionTurn(
    def,
    input.prepareState(def, baseState),
    input.seatId,
    input.playerIndex,
  );
  return runToCompetenceDecision({
    def,
    seed: input.seed,
    agents: createFitlPolicyAgents(),
    playerCount: PLAYER_COUNT,
    bootstrapState: prepared,
    maxTurns: 1,
    microturnBound: 80,
    advanceUntil: ({ microturn }) =>
      String(microturn.seatId) === input.seatId && microturn.kind === 'actionSelection',
  });
}

function createFitlPolicyAgents(): readonly Agent[] {
  return PROFILE_IDS.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'verbose' }));
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

function assertLeaderOptionPreviewIntegrity(result: CompetenceRunResult): void {
  for (const log of result.decisions) {
    const trace = log.agentDecision;
    if (trace === undefined || !trace.previewUsage.refIds.includes(LEADER_OPTION_DELTA_REF)) {
      continue;
    }
    const decisiveRefs: PreviewRefExpectation[] = (trace.candidates ?? [])
      .filter((candidate) =>
        candidate.previewRefIds.includes(LEADER_OPTION_DELTA_REF)
        || candidate.unknownPreviewRefs.some((ref) => ref.refId === LEADER_OPTION_DELTA_REF))
      .map((candidate) => {
        const base = {
          refId: LEADER_OPTION_DELTA_REF,
          stableMoveKey: candidate.stableMoveKey,
        };
        return candidate.previewOutcome === 'ready' ? { ...base, status: 'ready' as const } : base;
      });
    assertPreviewStatuses({
      result: { agentDecision: trace },
      decisiveRefs,
    });
  }
}

function assertSelectedSelfMarginTrace(result: CompetenceRunResult, stableMoveKey: string): void {
  assert.ok(result.agentDecision, 'expected policy decision trace');
  if (!result.agentDecision.candidates?.some((candidate) => candidate.stableMoveKey === stableMoveKey)) {
    return;
  }

  assertPreviewStatuses({
    result,
    decisiveRefs: [{ refId: SELF_MARGIN_REF, stableMoveKey, status: 'ready' }],
  });
}

function assertImmediateWinTrace(def: GameDef, result: CompetenceRunResult, expectedRootStableMoveKey: string): void {
  assertPolicySelectedRoot(def, result, 'shared.immediateWin', expectedRootStableMoveKey);
}

function assertMonsoonClearBranch(
  def: GameDef,
  result: CompetenceRunResult,
  input: FitlMonsoonPairCase,
): void {
  assert.ok(canonicalStateChanged(result.preState, result.postState), 'expected clear branch to change state');
  assert.equal(result.stopReason, 'turnCompleted');
  assert.ok(
    !result.agentDecision?.plan?.activeDoctrines.includes(MONSOON_DOCTRINE_ID),
    `expected clear branch to leave ${MONSOON_DOCTRINE_ID} inactive`,
  );
  if (input.clearTemplateId !== undefined || input.clearRootStableMoveKey !== undefined) {
    assertPlanTraceChain({
      def,
      result,
      expected: {
        ...(input.clearTemplateId === undefined ? {} : { eligibleTemplate: input.clearTemplateId }),
        ...(input.clearRootStableMoveKey === undefined ? {} : { selectedRootStableMoveKey: input.clearRootStableMoveKey }),
      },
    });
  }
}

function assertMonsoonRestrictedBranch(
  def: GameDef,
  result: CompetenceRunResult,
  input: FitlMonsoonPairCase,
): void {
  assert.ok(canonicalStateChanged(result.preState, result.postState), 'expected Monsoon branch to change state');
  assert.equal(result.stopReason, 'turnCompleted');
  if (
    input.clearRootStableMoveKey !== undefined
    && input.clearTemplateId !== undefined
    && input.monsoonRootStableMoveKey !== undefined
    && input.monsoonTemplateId !== undefined
  ) {
    assert.notDeepEqual(
      [input.monsoonRootStableMoveKey, input.monsoonTemplateId],
      [input.clearRootStableMoveKey, input.clearTemplateId],
      'expected Monsoon fallback root/template pair to differ from the clear branch',
    );
  }
  if (input.monsoonTemplateId === undefined && input.monsoonRootStableMoveKey === undefined) {
    assert.ok(
      result.agentDecision?.plan?.activeDoctrines.includes(MONSOON_DOCTRINE_ID),
      `expected ${MONSOON_DOCTRINE_ID} to be active`,
    );
  } else {
    assertPlanTraceChain({
      def,
      result,
      expected: {
        activeDoctrine: MONSOON_DOCTRINE_ID,
        ...(input.monsoonTemplateId === undefined ? {} : { eligibleTemplate: input.monsoonTemplateId }),
        ...(input.monsoonRootStableMoveKey === undefined ? {} : { selectedRootStableMoveKey: input.monsoonRootStableMoveKey }),
      },
    });
  }
  const filteredByMonsoon = result.agentDecision?.plan?.filteredOutTemplates
    .filter((entry) => entry.gatedBy.includes(MONSOON_DOCTRINE_ID))
    .map((entry) => entry.templateId)
    .sort() ?? [];
  assert.deepEqual(filteredByMonsoon, [...input.suppressedTemplateIds].sort());
}

function assertPolicySelectedRoot(
  def: GameDef,
  result: CompetenceRunResult,
  doctrineId: string,
  expectedRootStableMoveKey: string,
): void {
  assert.ok(result.agentDecision, 'expected policy decision trace');
  assert.ok(
    result.agentDecision.plan?.activeDoctrines.includes(doctrineId),
    `expected active doctrine ${doctrineId}; got ${JSON.stringify(result.agentDecision.plan?.activeDoctrines ?? [])}`,
  );
  assert.equal(decisionStableKey(def, result.selectedDecision), expectedRootStableMoveKey);
  assert.equal(result.agentDecision.selectedStableMoveKey, expectedRootStableMoveKey);
  assert.ok(
    result.targetFrontier.some((decision) => decisionStableKey(def, decision) === expectedRootStableMoveKey),
    `expected selected root ${expectedRootStableMoveKey} in published frontier`,
  );
}

export function decisionStableKey(def: GameDef, decision: Decision): string {
  if (decision.kind !== 'actionSelection') {
    return `${decision.kind}:${JSON.stringify(decision)}`;
  }
  return decision.move === undefined ? String(decision.actionId) : toMoveIdentityKey(def, decision.move);
}
