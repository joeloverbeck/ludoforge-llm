// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyPreviewRuntime, type PolicyPreviewCandidate } from '../../../src/agents/policy-preview.js';
import {
  applyMove,
  asPlayerId,
  enumerateLegalMoves,
  initialState,
  type AgentPolicyCatalog,
  type AgentPreviewCompletionPolicy,
  type ClassifiedMove,
  type CompiledAgentProfile,
  type GameDef,
  type GameState,
  type Move,
  type TrustedExecutableMove,
} from '../../../src/kernel/index.js';
import {
  getFitlProductionFixture,
  getTexasProductionFixture,
} from '../../helpers/production-spec-helpers.js';

const K_PREVIEW_DEPTH = 8;

interface ProductionCandidate {
  readonly def: GameDef;
  readonly state: GameState;
  readonly move: Move;
  readonly candidate: PolicyPreviewCandidate;
  readonly playerIndex: number;
  readonly seatId: string;
}

interface PreviewRun {
  readonly outcome: string;
  readonly failureReason: string | undefined;
  readonly stateHash: bigint | undefined;
}

const FITL_ACTION_WINDOWS = [
  { actionId: 'govern', passCount: 0 },
  { actionId: 'march', passCount: 1 },
  { actionId: 'train', passCount: 2 },
  { actionId: 'sweep', passCount: 0 },
  { actionId: 'assault', passCount: 2 },
] as const;

function findAction(def: GameDef, state: GameState, actionId: string): ClassifiedMove {
  const legal = enumerateLegalMoves(def, state).moves;
  const classified = legal.find((move) => String(move.move.actionId) === actionId);
  if (classified === undefined) {
    assert.fail(`Expected production action ${actionId}; legal actions: ${legal.map((move) => String(move.move.actionId)).join(', ')}`);
  }
  return classified;
}

function findTrustedAction(def: GameDef, state: GameState, actionId: string): TrustedExecutableMove {
  const classified = findAction(def, state, actionId);
  if (classified.trustedMove === undefined) {
    assert.fail(`Expected production action ${actionId} to carry a trusted move.`);
  }
  return classified.trustedMove;
}

function applyPass(def: GameDef, state: GameState): GameState {
  const trustedMove = findTrustedAction(def, state, 'pass');
  return applyMove(def, state, trustedMove, { advanceToDecisionPoint: true }).state;
}

function fitlStateAfterPasses(def: GameDef, passCount: number): GameState {
  let state = initialState(def, 145, 4).state;
  for (let index = 0; index < passCount; index += 1) {
    state = applyPass(def, state);
  }
  return state;
}

function makeCandidate(input: {
  readonly def: GameDef;
  readonly state: GameState;
  readonly actionId: string;
  readonly playerIndex: number;
  readonly seatId: string;
}): ProductionCandidate {
  const move = findAction(input.def, input.state, input.actionId).move;
  return {
    def: input.def,
    state: input.state,
    move,
    playerIndex: input.playerIndex,
    seatId: input.seatId,
    candidate: {
      move,
      stableMoveKey: `${input.def.metadata.id}:${input.actionId}:${input.state.stateHash.toString()}`,
      actionId: input.actionId,
    },
  };
}

function profileDeps(def: GameDef, seatId: string): {
  readonly catalog: AgentPolicyCatalog;
  readonly profile: CompiledAgentProfile;
} {
  const catalog = def.agents;
  if (catalog === undefined) {
    assert.fail('Expected production game to compile an agent catalog.');
  }
  const profileId = catalog.bindingsBySeat[seatId];
  if (profileId === undefined) {
    assert.fail(`Expected production seat ${seatId} to bind an agent profile.`);
  }
  const profile = catalog.profiles[profileId];
  if (profile === undefined) {
    assert.fail(`Expected production profile ${profileId} to exist.`);
  }
  return { catalog, profile };
}

function runPreview(
  input: ProductionCandidate,
  policy: AgentPreviewCompletionPolicy,
  completionDepthCap: number,
): PreviewRun {
  const runtime = createPolicyPreviewRuntime({
    def: input.def,
    state: input.state,
    playerId: asPlayerId(input.playerIndex),
    seatId: input.seatId,
    trustedMoveIndex: new Map<string, TrustedExecutableMove>(),
    previewMode: 'tolerateStochastic',
    completionPolicy: policy,
    completionDepthCap,
    ...(policy === 'agentGuided' ? { agentGuidedDeps: profileDeps(input.def, input.seatId) } : {}),
  });
  const previewState = runtime.getPreviewState(input.candidate);
  return {
    outcome: runtime.getOutcome(input.candidate),
    failureReason: runtime.getFailureReason(input.candidate),
    stateHash: previewState?.stateHash,
  };
}

function assertReadyStateMovement(input: ProductionCandidate, label: string): void {
  const result = runPreview(input, 'greedy', K_PREVIEW_DEPTH);
  assert.equal(result.outcome, 'ready', `${label} should complete under K_PREVIEW_DEPTH.`);
  assert.equal(result.failureReason, undefined, `${label} should not report a preview failure.`);
  assert.notEqual(result.stateHash, undefined, `${label} should expose a preview state.`);
  assert.notEqual(result.stateHash, input.state.stateHash, `${label} should move state during synthetic completion.`);
}

describe('policy preview driver cross-game conformance', () => {
  it('drives production FITL operation witnesses through bounded ready previews', () => {
    const def = getFitlProductionFixture().gameDef;
    for (const { actionId, passCount } of FITL_ACTION_WINDOWS) {
      const candidate = makeCandidate({
        def,
        state: fitlStateAfterPasses(def, passCount),
        actionId,
        playerIndex: 0,
        seatId: 'us',
      });

      assertReadyStateMovement(candidate, `FITL ${actionId}`);
    }
  });

  it('returns depthCap for the production FITL March witness when the cap is lowered', () => {
    const def = getFitlProductionFixture().gameDef;
    const candidate = makeCandidate({
      def,
      state: fitlStateAfterPasses(def, 1),
      actionId: 'march',
      playerIndex: 0,
      seatId: 'us',
    });

    const result = runPreview(candidate, 'greedy', 2);

    assert.equal(result.outcome, 'depthCap');
    assert.equal(result.failureReason, 'depthCap');
    assert.equal(result.stateHash, undefined);
  });

  it('drives a production Texas Holdem raise witness through the same ready-preview shape', () => {
    const def = getTexasProductionFixture().gameDef;
    const candidate = makeCandidate({
      def,
      state: initialState(def, 145, 6).state,
      actionId: 'raise',
      playerIndex: 0,
      seatId: 'neutral',
    });

    assertReadyStateMovement(candidate, 'Texas Holdem raise');
  });

  for (const policy of ['greedy', 'agentGuided'] as const) {
    it(`is deterministic for repeated ${policy} production FITL Govern previews`, () => {
      const def = getFitlProductionFixture().gameDef;
      const candidate = makeCandidate({
        def,
        state: fitlStateAfterPasses(def, 0),
        actionId: 'govern',
        playerIndex: 0,
        seatId: 'us',
      });

      const first = runPreview(candidate, policy, K_PREVIEW_DEPTH);
      const second = runPreview(candidate, policy, K_PREVIEW_DEPTH);

      assert.equal(first.outcome, 'ready');
      assert.equal(second.outcome, 'ready');
      assert.equal(first.failureReason, undefined);
      assert.equal(second.failureReason, undefined);
      assert.notEqual(first.stateHash, undefined);
      assert.equal(first.stateHash, second.stateHash);
    });
  }
});
