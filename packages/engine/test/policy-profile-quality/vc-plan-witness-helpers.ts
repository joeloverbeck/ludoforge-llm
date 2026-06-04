import * as assert from 'node:assert/strict';

import { proposeAdvisoryTurnPlan, type PlanProposalAlternative, type PlanProposalResult } from '../../src/agents/plan-proposal.js';
import {
  asActionId,
  asPlayerId,
  assertValidatedGameDef,
  initialState,
  type CompiledAgentProfile,
  type Decision,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { moveFactionBoardTokensToZone, moveOneToken } from './shared-competence-helpers.js';

const FITL_PLAYER_COUNT = 4;
const VC_PROFILE_ID = 'vc-baseline';

export interface VcPlanFixture {
  readonly def: GameDef;
  readonly profile: CompiledAgentProfile;
  readonly state: GameState;
}

export const loadVcPlanFixture = (seed: number): VcPlanFixture => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);

  const def = assertValidatedGameDef(compiled.gameDef);
  const profile = def.agents?.profiles[VC_PROFILE_ID];
  assert.ok(def.agents, 'expected FITL production agents');
  assert.ok(profile, 'expected vc-baseline profile');

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

export const proposeVcPlan = (
  fixture: VcPlanFixture,
  actionIds: readonly string[],
  state: GameState = fixture.state,
): PlanProposalResult => proposeAdvisoryTurnPlan({
  def: fixture.def,
  state,
  seatId: 'vc',
  playerId: asPlayerId(3),
  profile: fixture.profile,
  catalog: fixture.def.agents!,
  actionDecisions: actionIds.map(actionDecision),
});

export const proposeVcPlanFromDecisions = (
  fixture: VcPlanFixture,
  actionDecisions: readonly Extract<Decision, { readonly kind: 'actionSelection' }>[],
  state: GameState = fixture.state,
): PlanProposalResult => proposeAdvisoryTurnPlan({
  def: fixture.def,
  state,
  seatId: 'vc',
  playerId: asPlayerId(3),
  profile: fixture.profile,
  catalog: fixture.def.agents!,
  actionDecisions,
});

export const requireAlternative = (
  result: PlanProposalResult,
  templateId: string,
): PlanProposalAlternative => {
  const alternative = result.alternatives.find((entry) => entry.templateId === templateId);
  assert.ok(alternative, `expected ${templateId} proposal alternative`);
  return alternative;
};

export const emitVcArchitecturalRecord = (
  file: string,
  seed: number,
  passed: boolean,
  decisions = 1,
): void => {
  emitPolicyProfileQualityRecord({
    file,
    variantId: VC_PROFILE_ID,
    seed,
    passed,
    stopReason: 'architectural-invariant',
    decisions,
  });
};

export const assertProfileBinds = (
  fixture: VcPlanFixture,
  expected: {
    readonly guardrails?: readonly string[];
    readonly strategyModules?: readonly string[];
    readonly planTemplates?: readonly string[];
  },
): void => {
  for (const id of expected.guardrails ?? []) {
    assert.equal((fixture.profile.use.guardrails ?? []).includes(id), true, `expected vc-baseline to bind guardrail ${id}`);
  }

  for (const id of expected.strategyModules ?? []) {
    assert.equal((fixture.profile.plan.strategyModules ?? []).includes(id), true, `expected vc-baseline to bind strategy module ${id}`);
  }

  for (const id of expected.planTemplates ?? []) {
    assert.equal((fixture.profile.plan.planTemplates ?? []).includes(id), true, `expected vc-baseline to bind plan template ${id}`);
  }
};

export const includesId = (values: readonly unknown[] | undefined, id: string): boolean =>
  (values ?? []).some((value) => String(value) === id);

export const prepareVcAttackAmbushState = (def: GameDef, state: GameState): GameState => {
  const withoutMapVc = moveFactionBoardTokensToZone(def, state, 'VC', 'available-VC:none');
  const withVc = moveOneToken(withoutMapVc, 'available-VC:none', 'saigon:none', (token) =>
    token.props.faction === 'VC' && token.props.type === 'guerrilla');
  return moveOneToken(withVc, 'available-US:none', 'saigon:none', (token) =>
    token.props.faction === 'US' && token.props.type === 'troops');
};

export const vcAttackMove = (withAmbush: boolean): Move => {
  const attackTargetKey = 'decision:doc.actionPipelines.13.stages[0].effects.0.if.else.0.chooseN::$targetSpaces';
  const ambushTargetKey = 'decision:doc.actionPipelines.28.stages[0].effects.0.if.else.0.if.else.0.if.else.0.chooseN::$targetSpaces';
  const ambushModeKey = 'decision:doc.actionPipelines.28.stages[1].effects.0.forEach.effects.1.let.in.0.let.in.0.if.else.0.chooseOne::$ambushTargetMode@saigon:none[0][0]';
  const base: Move = {
    actionId: asActionId('attack'),
    params: { [attackTargetKey]: ['saigon:none'] },
    actionClass: 'operation',
  };
  return withAmbush
    ? {
        ...base,
        actionClass: 'operationPlusSpecialActivity',
        compound: {
          specialActivity: {
            actionId: asActionId('ambushVc'),
            params: {
              [ambushTargetKey]: ['saigon:none'],
              [ambushModeKey]: 'self',
            },
          },
          timing: 'during',
        },
      }
    : base;
};

export const countFactionInZone = (state: GameState, zoneId: string, faction: string): number =>
  (state.zones[zoneId] ?? []).filter((token) => token.props.faction === faction).length;
