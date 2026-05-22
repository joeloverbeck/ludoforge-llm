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
const ARVN_PROFILE_ID = 'arvn-evolved';

export interface ArvnPlanFixture {
  readonly def: GameDef;
  readonly profile: CompiledAgentProfile;
  readonly state: GameState;
}

export const loadArvnPlanFixture = (seed: number): ArvnPlanFixture => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);

  const def = assertValidatedGameDef(compiled.gameDef);
  const profile = def.agents?.profiles[ARVN_PROFILE_ID];
  assert.ok(def.agents, 'expected FITL production agents');
  assert.ok(profile, 'expected arvn-evolved profile');

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
