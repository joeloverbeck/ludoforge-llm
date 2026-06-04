import * as assert from 'node:assert/strict';

import { proposeAdvisoryTurnPlan, type PlanProposalAlternative, type PlanProposalResult } from '../../src/agents/plan-proposal.js';
import {
  advanceAutoresolvable,
  asActionId,
  asPlayerId,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  publishMicroturnFromCanonicalState,
  applyPublishedDecisionFromCanonicalState,
  initialState,
  withResolvedHash,
  type Agent,
  type CompiledAgentProfile,
  type Decision,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';
import { resolveActiveDeciderSeatIdForPlayer } from '../../src/kernel/microturn/types.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const FITL_PLAYER_COUNT = 4;
const ARVN_PROFILE_ID = 'arvn-baseline';

export interface ArvnPlanFixture {
  readonly def: GameDef;
  readonly profile: CompiledAgentProfile;
  readonly state: GameState;
}

export interface ArvnExecutedRootResult {
  readonly def: GameDef;
  readonly rootStableMoveKey: string;
  readonly preState: GameState;
  readonly postState: GameState;
  readonly decisions: readonly Decision[];
}

export const loadArvnPlanFixture = (seed: number): ArvnPlanFixture => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);

  const def = assertValidatedGameDef(compiled.gameDef);
  const profile = def.agents?.profiles[ARVN_PROFILE_ID];
  assert.ok(def.agents, 'expected FITL production agents');
  assert.ok(profile, 'expected arvn-baseline profile');

  return {
    def,
    profile,
    state: initialState(def, seed, FITL_PLAYER_COUNT).state,
  };
};

export const actionDecision = (actionId: string): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId(actionId),
  move: { actionId: asActionId(actionId), params: {} },
});

export const compoundActionDecision = (
  actionId: string,
  specialActionId: string,
): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId(actionId),
  move: {
    actionId: asActionId(actionId),
    params: {},
    actionClass: 'operationPlusSpecialActivity',
    compound: {
      specialActivity: { actionId: asActionId(specialActionId), params: {} },
      timing: 'after',
    },
  },
});

export const proposeArvnPlan = (
  fixture: ArvnPlanFixture,
  actionIds: readonly string[],
  state: GameState = fixture.state,
): PlanProposalResult => proposeAdvisoryTurnPlan({
  def: fixture.def,
  state,
  seatId: 'arvn',
  playerId: asPlayerId(1),
  profile: fixture.profile,
  catalog: fixture.def.agents!,
  actionDecisions: actionIds.map(actionDecision),
});

export const proposeArvnCompoundPlan = (
  fixture: ArvnPlanFixture,
  roots: readonly { readonly actionId: string; readonly specialActionId: string }[],
  state: GameState = fixture.state,
): PlanProposalResult => proposeAdvisoryTurnPlan({
  def: fixture.def,
  state,
  seatId: 'arvn',
  playerId: asPlayerId(1),
  profile: fixture.profile,
  catalog: fixture.def.agents!,
  actionDecisions: roots.map((root) => compoundActionDecision(root.actionId, root.specialActionId)),
});

export const withSecondEligibleArvnAfterUsEvent = (
  def: GameDef,
  state: GameState,
): GameState => {
  assert.equal(state.turnOrderState?.type, 'cardDriven');
  return {
    ...state,
    activePlayer: asPlayerId(1),
    activeDeciderSeatId: resolveActiveDeciderSeatIdForPlayer(def, 1),
    turnOrderState: {
      ...state.turnOrderState,
      runtime: {
        ...state.turnOrderState.runtime,
        currentCard: {
          ...state.turnOrderState.runtime.currentCard,
          firstEligible: 'us',
          secondEligible: 'arvn',
          actedSeats: ['us'],
          passedSeats: [],
          nonPassCount: 1,
          firstActionClass: 'event',
        },
      },
    },
  };
};

export const executePublishedArvnCompoundRoot = (
  fixture: ArvnPlanFixture,
  input: {
    readonly actionId: string;
    readonly specialActionId: string;
    readonly seed: number;
    readonly prepareState?: (def: GameDef, state: GameState) => GameState;
    readonly microturnBound?: number;
  },
): ArvnExecutedRootResult => {
  const runtime = createGameDefRuntime(fixture.def);
  const prepared = input.prepareState === undefined
    ? fixture.state
    : input.prepareState(fixture.def, fixture.state);
  let state = withResolvedHash(
    fixture.def,
    withSecondEligibleArvnAfterUsEvent(fixture.def, prepared),
    runtime,
  );
  const preState = state;
  let rng = createRng(BigInt(input.seed));
  const rootMicroturn = publishMicroturnFromCanonicalState(fixture.def, state, runtime);
  const rootDecision = rootMicroturn.legalActions.find(
    (decision): decision is Extract<Decision, { readonly kind: 'actionSelection' }> =>
      decision.kind === 'actionSelection'
      && String(decision.move?.actionId) === input.actionId
      && String(decision.move?.compound?.specialActivity.actionId) === input.specialActionId,
  );
  assert.ok(rootDecision?.move, `expected published ${input.actionId}+${input.specialActionId} root`);
  const rootStableMoveKey = toMoveIdentityKey(fixture.def, rootDecision.move);
  const decisions: Decision[] = [rootDecision];
  state = applyPublishedDecisionFromCanonicalState(fixture.def, state, rootMicroturn, rootDecision, undefined, runtime).state;

  const agent: Agent = new PolicyAgent({ profileId: ARVN_PROFILE_ID, traceLevel: 'summary' });
  for (let index = 0; index < (input.microturnBound ?? 64); index += 1) {
    const auto = advanceAutoresolvable(fixture.def, state, rng, runtime);
    state = auto.state;
    rng = auto.rng;
    if (auto.autoResolvedLogs.some((log) => log.turnRetired)) {
      return { def: fixture.def, rootStableMoveKey, preState, postState: state, decisions };
    }
    const microturn = publishMicroturnFromCanonicalState(fixture.def, state, runtime);
    if (String(microturn.seatId) !== 'arvn') {
      return { def: fixture.def, rootStableMoveKey, preState, postState: state, decisions };
    }
    const selected = agent.chooseDecision({ def: fixture.def, state, microturn, rng, runtime });
    rng = selected.rng;
    decisions.push(selected.decision);
    const applied = applyPublishedDecisionFromCanonicalState(
      fixture.def,
      state,
      microturn,
      selected.decision,
      undefined,
      runtime,
    );
    state = applied.state;
    if (applied.log.turnRetired) {
      return { def: fixture.def, rootStableMoveKey, preState, postState: state, decisions };
    }
  }
  throw new Error(`ARVN ${input.actionId}+${input.specialActionId} execution exceeded microturn bound`);
};

export const requireAlternative = (
  result: PlanProposalResult,
  templateId: string,
): PlanProposalAlternative => {
  const alternative = result.alternatives.find((entry) => entry.templateId === templateId);
  assert.ok(alternative, `expected ${templateId} proposal alternative`);
  return alternative;
};

export const requireSelectedTemplate = (
  result: PlanProposalResult,
  templateId: string,
): NonNullable<PlanProposalResult['selected']> => {
  assert.equal(result.status, 'selected');
  assert.equal(result.selected?.templateId, templateId);
  assert.ok(result.selected, `expected selected ${templateId} proposal`);
  return result.selected;
};

export const withZoneSupportMarkers = (
  state: GameState,
  supportByZone: Readonly<Record<string, string>>,
): GameState => ({
  ...state,
  markers: {
    ...state.markers,
    ...Object.fromEntries(Object.entries(supportByZone).map(([zoneId, support]) => [
      zoneId,
      {
        ...(state.markers[zoneId] ?? {}),
        supportOpposition: support,
      },
    ])),
  },
});

export const withEveryZoneSupportMarker = (
  def: GameDef,
  state: GameState,
  support: string,
): GameState => withZoneSupportMarkers(
  state,
  Object.fromEntries(def.zones.map((zone) => [zone.id, support])),
);
