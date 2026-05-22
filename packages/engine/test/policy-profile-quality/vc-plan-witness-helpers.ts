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
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

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

export const requireAlternative = (
  result: PlanProposalResult,
  templateId: string,
): PlanProposalAlternative => {
  const alternative = result.alternatives.find((entry) => entry.templateId === templateId);
  assert.ok(alternative, `expected ${templateId} proposal alternative`);
  return alternative;
};
