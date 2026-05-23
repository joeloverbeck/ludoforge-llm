// @test-class: convergence-witness
// @profile-variant: spec-190-arvn-root-override
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { evaluatePolicyMove } from '../../src/agents/policy-eval.js';
import {
  asDecisionFrameId,
  asPlayerId,
  asSeatId,
  asTurnId,
  createRng,
  type AgentMicroturnDecisionInput,
  type CompiledAgentProfile,
  type Decision,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  actionDecision,
  loadArvnPlanFixture,
  proposeArvnPlan,
} from './arvn-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 190002;
const ARVN_PLAYER_ID = asPlayerId(1);
const ARVN_PROFILE_ID = 'arvn-baseline';
const PLANLESS_PROFILE_ID = 'spec-190-arvn-planless-control';

const withActiveArvnPlayer = (state: GameState): GameState => ({
  ...state,
  activePlayer: ARVN_PLAYER_ID,
});

const createInput = (
  def: GameDef,
  state: GameState,
  actionIds: readonly string[],
): AgentMicroturnDecisionInput => {
  const legalActions = actionIds.map(actionDecision);
  return {
    def,
    state,
    rng: createRng(BigInt(SEED)),
    microturn: {
      kind: 'actionSelection',
      seatId: asSeatId('arvn'),
      decisionContext: {
        kind: 'actionSelection',
        seatId: asSeatId('arvn'),
        eligibleActions: legalActions.map((decision) => decision.actionId),
      },
      legalActions,
      projectedState: { state },
      turnId: asTurnId(SEED),
      frameId: asDecisionFrameId(1),
      compoundTurnTrace: [],
    },
  };
};

const requireMove = (decision: Extract<Decision, { readonly kind: 'actionSelection' }>): Move => {
  assert.ok(decision.move, `expected ${String(decision.actionId)} action decision to carry a move`);
  return decision.move;
};

const createPlanlessControlDef = (def: GameDef, profile: CompiledAgentProfile): GameDef => ({
  ...def,
  agents: {
    ...def.agents!,
    profiles: {
      ...def.agents!.profiles,
      [PLANLESS_PROFILE_ID]: {
        ...profile,
        fingerprint: `${profile.fingerprint}:spec-190-planless-control`,
        plan: {
          ...profile.plan,
          planTemplates: [],
        },
      },
    },
  },
});

describe('Spec 190 ARVN root-override witness', () => {
  it('returns the selected ARVN plan root when scalar evaluation would choose a different root', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const state = withActiveArvnPlayer(fixture.state);
    const actionIds = ['train', 'govern'];
    const actionDecisions = actionIds.map(actionDecision);

    const plan = proposeArvnPlan(fixture, actionIds, state);
    const selectedPlanRoot = plan.selected?.rootStableMoveKey;
    assert.equal(plan.status, 'selected');
    assert.equal(plan.selected?.templateId, 'arvn.trainGovern');
    assert.ok(selectedPlanRoot, 'expected selected ARVN plan root');

    const scalar = evaluatePolicyMove({
      def: fixture.def,
      state,
      playerId: ARVN_PLAYER_ID,
      legalMoves: actionDecisions.map(requireMove),
      trustedMoveIndex: new Map(),
      rng: createRng(BigInt(SEED)),
      profileIdOverride: ARVN_PROFILE_ID,
      traceLevel: 'verbose',
    });
    const scalarRoot = toMoveIdentityKey(fixture.def, scalar.move);
    assert.notEqual(selectedPlanRoot, scalarRoot, 'witness must exercise a real plan/scalar divergence');

    const planPrimary = new PolicyAgent({ profileId: ARVN_PROFILE_ID, traceLevel: 'verbose' })
      .chooseDecision(createInput(fixture.def, state, actionIds));
    assert.equal(planPrimary.decision.kind, 'actionSelection');
    assert.ok(planPrimary.decision.move, 'expected selected action move');
    assert.equal(toMoveIdentityKey(fixture.def, planPrimary.decision.move), selectedPlanRoot);
    assert.equal(planPrimary.agentDecision?.plan?.status, 'selected');
    assert.equal(planPrimary.agentDecision?.plan?.selectedRootStableMoveKey, selectedPlanRoot);
    assert.ok(
      actionDecisions.some((decision) => toMoveIdentityKey(fixture.def, requireMove(decision)) === selectedPlanRoot),
      'plan-selected root must be in the published frontier',
    );

    const controlDef = createPlanlessControlDef(fixture.def, fixture.profile);
    const planlessControl = new PolicyAgent({ profileId: PLANLESS_PROFILE_ID, traceLevel: 'verbose' })
      .chooseDecision(createInput(controlDef, state, actionIds));
    assert.equal(planlessControl.decision.kind, 'actionSelection');
    assert.ok(planlessControl.decision.move, 'expected selected action move');
    assert.equal(toMoveIdentityKey(controlDef, planlessControl.decision.move), scalarRoot);
    assert.notEqual(planlessControl.agentDecision?.plan?.status, 'selected');

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'spec-190-arvn-root-override',
      seed: SEED,
      passed: true,
      stopReason: 'plan-root-overrode-scalar-root',
      decisions: actionIds.length,
    });
  });
});
