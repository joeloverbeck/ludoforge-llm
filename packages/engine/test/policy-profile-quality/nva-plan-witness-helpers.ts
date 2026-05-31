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
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const FITL_PLAYER_COUNT = 4;
const NVA_PROFILE_ID = 'nva-baseline';

export interface NvaPlanFixture {
  readonly def: GameDef;
  readonly profile: CompiledAgentProfile;
  readonly state: GameState;
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
