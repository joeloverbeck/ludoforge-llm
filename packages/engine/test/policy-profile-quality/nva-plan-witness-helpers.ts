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
  type Token,
} from '../../src/kernel/index.js';
import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';
import { resolveActiveDeciderSeatIdForPlayer } from '../../src/kernel/microturn/types.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const FITL_PLAYER_COUNT = 4;
const NVA_PROFILE_ID = 'nva-baseline';

export interface NvaPlanFixture {
  readonly def: GameDef;
  readonly profile: CompiledAgentProfile;
  readonly state: GameState;
}

export interface NvaExecutedRootResult {
  readonly def: GameDef;
  readonly rootStableMoveKey: string;
  readonly preState: GameState;
  readonly postState: GameState;
  readonly decisions: readonly Decision[];
}

export const loadNvaPlanFixture = (seed: number): NvaPlanFixture => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);

  const def = assertValidatedGameDef(compiled.gameDef);
  const profile = def.agents?.profiles[NVA_PROFILE_ID];
  assert.ok(def.agents, 'expected FITL production agents');
  assert.ok(profile, 'expected nva-baseline profile');

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
  compound?: {
    readonly timing?: 'before' | 'during' | 'after';
    readonly insertAfterStage?: number;
    readonly replaceRemainingStages?: boolean;
  },
): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId(actionId),
  move: {
    actionId: asActionId(actionId),
    params: {},
    actionClass: 'operationPlusSpecialActivity',
    compound: {
      specialActivity: { actionId: asActionId(specialActionId), params: {} },
      timing: compound?.timing ?? 'after',
      ...(compound?.insertAfterStage === undefined ? {} : { insertAfterStage: compound.insertAfterStage }),
      ...(compound?.replaceRemainingStages === undefined ? {} : { replaceRemainingStages: compound.replaceRemainingStages }),
    },
  },
});

export const proposeNvaPlan = (
  fixture: NvaPlanFixture,
  actionIds: readonly string[],
  state: GameState = fixture.state,
): PlanProposalResult => proposeAdvisoryTurnPlan({
  def: fixture.def,
  state,
  seatId: 'nva',
  playerId: asPlayerId(2),
  profile: fixture.profile,
  catalog: fixture.def.agents!,
  actionDecisions: actionIds.map(actionDecision),
});

export const proposeNvaCompoundPlan = (
  fixture: NvaPlanFixture,
  roots: readonly {
    readonly actionId: string;
    readonly specialActionId: string;
    readonly timing?: 'before' | 'during' | 'after';
    readonly insertAfterStage?: number;
    readonly replaceRemainingStages?: boolean;
  }[],
  state: GameState = fixture.state,
): PlanProposalResult => proposeAdvisoryTurnPlan({
  def: fixture.def,
  state,
  seatId: 'nva',
  playerId: asPlayerId(2),
  profile: fixture.profile,
  catalog: fixture.def.agents!,
  actionDecisions: roots.map((root) => compoundActionDecision(root.actionId, root.specialActionId, root)),
});

export const proposeNvaPlanFromDecisions = (
  fixture: NvaPlanFixture,
  actionDecisions: readonly Extract<Decision, { readonly kind: 'actionSelection' }>[],
  state: GameState = fixture.state,
): PlanProposalResult => proposeAdvisoryTurnPlan({
  def: fixture.def,
  state,
  seatId: 'nva',
  playerId: asPlayerId(2),
  profile: fixture.profile,
  catalog: fixture.def.agents!,
  actionDecisions,
});

export const withSecondEligibleNvaAfterUsEvent = (
  def: GameDef,
  state: GameState,
): GameState => {
  assert.equal(state.turnOrderState?.type, 'cardDriven');
  return {
    ...state,
    activePlayer: asPlayerId(2),
    activeDeciderSeatId: resolveActiveDeciderSeatIdForPlayer(def, 2),
    turnOrderState: {
      ...state.turnOrderState,
      runtime: {
        ...state.turnOrderState.runtime,
        currentCard: {
          ...state.turnOrderState.runtime.currentCard,
          firstEligible: 'us',
          secondEligible: 'nva',
          actedSeats: ['us'],
          passedSeats: [],
          nonPassCount: 1,
          firstActionClass: 'event',
        },
      },
    },
  };
};

export const executePublishedNvaRoot = (
  fixture: NvaPlanFixture,
  input: {
    readonly actionId: string;
    readonly specialActionId?: string;
    readonly timing?: 'before' | 'during' | 'after';
    readonly insertAfterStage?: number;
    readonly replaceRemainingStages?: boolean;
    readonly seed: number;
    readonly prepareState?: (def: GameDef, state: GameState) => GameState;
    readonly microturnBound?: number;
  },
): NvaExecutedRootResult => {
  const runtime = createGameDefRuntime(fixture.def);
  const prepared = input.prepareState === undefined
    ? fixture.state
    : input.prepareState(fixture.def, fixture.state);
  let state = withResolvedHash(
    fixture.def,
    withSecondEligibleNvaAfterUsEvent(fixture.def, prepared),
    runtime,
  );
  const preState = state;
  let rng = createRng(BigInt(input.seed));
  const rootMicroturn = publishMicroturnFromCanonicalState(fixture.def, state, runtime);
  const rootDecision = rootMicroturn.legalActions.find(
    (decision): decision is Extract<Decision, { readonly kind: 'actionSelection' }> => {
      if (decision.kind !== 'actionSelection' || decision.move === undefined) {
        return false;
      }
      if (String(decision.move.actionId) !== input.actionId) {
        return false;
      }
      const compound = decision.move.compound;
      if (input.specialActionId === undefined) {
        return compound === undefined;
      }
      return compound !== undefined
        && String(compound.specialActivity.actionId) === input.specialActionId
        && (input.timing === undefined || compound.timing === input.timing)
        && (input.insertAfterStage === undefined || compound.insertAfterStage === input.insertAfterStage)
        && (input.replaceRemainingStages === undefined || compound.replaceRemainingStages === input.replaceRemainingStages);
    },
  );
  assert.ok(
    rootDecision?.move,
    `expected published ${input.specialActionId === undefined ? input.actionId : `${input.actionId}+${input.specialActionId}`} root`,
  );
  const rootStableMoveKey = toMoveIdentityKey(fixture.def, rootDecision.move);
  const decisions: Decision[] = [rootDecision];
  state = applyPublishedDecisionFromCanonicalState(fixture.def, state, rootMicroturn, rootDecision, undefined, runtime).state;

  const agent: Agent = new PolicyAgent({ profileId: NVA_PROFILE_ID, traceLevel: 'summary' });
  for (let index = 0; index < (input.microturnBound ?? 80); index += 1) {
    const auto = advanceAutoresolvable(fixture.def, state, rng, runtime);
    state = auto.state;
    rng = auto.rng;
    if (auto.autoResolvedLogs.some((log) => log.turnRetired)) {
      return { def: fixture.def, rootStableMoveKey, preState, postState: state, decisions };
    }
    const microturn = publishMicroturnFromCanonicalState(fixture.def, state, runtime);
    if (String(microturn.seatId) !== 'nva') {
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
  throw new Error(`NVA ${input.actionId}${input.specialActionId === undefined ? '' : `+${input.specialActionId}`} execution exceeded microturn bound`);
};

export const countFactionTokens = (
  state: GameState,
  faction: string,
  type?: string,
): number => Object.values(state.zones)
  .flat()
  .filter((token) => token.props.faction === faction && (type === undefined || token.props.type === type))
  .length;

export const countBoardFactionTokens = (
  def: GameDef,
  state: GameState,
  faction: string,
  type?: string,
): number => {
  const boardZones = new Set(def.zones.filter((zone) => zone.zoneKind === 'board').map((zone) => String(zone.id)));
  return Object.entries(state.zones)
    .filter(([zoneId]) => boardZones.has(zoneId))
    .flatMap(([, tokens]) => tokens)
    .filter((token) => token.props.faction === faction && (type === undefined || token.props.type === type))
    .length;
};

export const countZoneFactionTokens = (
  state: GameState,
  zoneId: string,
  faction: string,
  type?: string,
): number => (state.zones[zoneId] ?? [])
  .filter((token) => token.props.faction === faction && (type === undefined || token.props.type === type))
  .length;

export const withNvaPressureAtQuangTri = (_def: GameDef, state: GameState): GameState => {
  let next = state;
  for (let index = 0; index < 10; index += 1) {
    next = moveOneMatchingToken(next, 'available-NVA:none', 'quang-tri-thua-thien:none', (token) =>
      token.props.faction === 'NVA' && token.props.type === 'troops');
  }
  return moveOneMatchingToken(next, 'available-NVA:none', 'quang-tri-thua-thien:none', (token) =>
    token.props.faction === 'NVA' && token.props.type === 'guerrilla');
};

export const publishedSecondEligibleNvaActionDecisions = (
  fixture: NvaPlanFixture,
  state: GameState,
): readonly Extract<Decision, { readonly kind: 'actionSelection' }>[] => {
  const runtime = createGameDefRuntime(fixture.def);
  const published = publishMicroturnFromCanonicalState(
    fixture.def,
    withResolvedHash(fixture.def, withSecondEligibleNvaAfterUsEvent(fixture.def, state), runtime),
    runtime,
  );
  return published.legalActions.filter(
    (decision): decision is Extract<Decision, { readonly kind: 'actionSelection' }> =>
      decision.kind === 'actionSelection',
  );
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

function moveOneMatchingToken(
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

export const requireAlternative = (
  result: PlanProposalResult,
  templateId: string,
): PlanProposalAlternative => {
  const alternative = result.alternatives.find((entry) => entry.templateId === templateId);
  assert.ok(alternative, `expected ${templateId} proposal alternative`);
  return alternative;
};

export const emitNvaPolicyQualityRecord = (input: {
  readonly file: string;
  readonly seed: number;
  readonly passed: boolean;
  readonly decisions: number;
  readonly stopReason?: string;
}): void => {
  emitPolicyProfileQualityRecord({
    file: input.file,
    variantId: NVA_PROFILE_ID,
    seed: input.seed,
    passed: input.passed,
    stopReason: input.stopReason ?? 'architectural-invariant',
    decisions: input.decisions,
  });
};

export const assertIncludesAll = (
  actual: readonly string[] | undefined,
  expected: readonly string[],
  label: string,
): void => {
  const missing = expected.filter((id) => !(actual ?? []).includes(id));
  assert.deepEqual(missing, [], `${label} missing: ${missing.join(', ')}`);
};

export const assertExcludesAll = (
  actual: readonly string[] | undefined,
  unexpected: readonly string[],
  label: string,
): void => {
  const present = unexpected.filter((id) => (actual ?? []).includes(id));
  assert.deepEqual(present, [], `${label} unexpectedly present: ${present.join(', ')}`);
};

export const assertTemplateRole = (
  fixture: NvaPlanFixture,
  templateId: string,
  role: string,
  selectorId: string,
): void => {
  assert.equal(
    fixture.def.agents?.library.planTemplates?.[templateId]?.roles[role]?.selectorId,
    selectorId,
    `${templateId}.${role} selector`,
  );
};
