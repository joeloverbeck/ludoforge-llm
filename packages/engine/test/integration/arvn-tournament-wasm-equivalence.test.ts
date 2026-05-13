// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { __internal_for_tests as policyWasmRuntimeInternals } from '../../src/agents/policy-wasm-runtime.js';
import { initializePolicyWasmRuntimeSync } from '../../src/agents/policy-wasm-runtime-node-loader.js';
import { createGameDefRuntime, type AgentDecisionTrace, type Decision } from '../../src/kernel/index.js';
import { runGameSteps } from '../../src/sim/index.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const SEED = 1000;
const PLAYER_COUNT = 4;
const MAX_TURNS = 20;
const TARGET_PLAYER_DECISIONS = 80;
const SEAT_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'] as const;

interface NormalizedDecision {
  readonly decision: Decision | undefined;
  readonly candidates: readonly {
    readonly actionId: string;
    readonly stableMoveKey: string;
    readonly score: number;
  }[];
}

const createAgents = () =>
  SEAT_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'verbose' }));

const normalizeCandidates = (agentDecision: AgentDecisionTrace | undefined): NormalizedDecision['candidates'] =>
  (agentDecision?.candidates ?? []).map((candidate) => ({
    actionId: candidate.actionId,
    stableMoveKey: candidate.stableMoveKey,
    score: candidate.score,
  }));

const decisionSummary = (decision: Decision | undefined): string => {
  if (decision === undefined) {
    return 'undefined';
  }
  if (decision.kind === 'actionSelection') {
    return `actionSelection:${decision.actionId}`;
  }
  if (decision.kind === 'chooseNStep') {
    return `chooseNStep:${decision.command}:${decision.value ?? 'confirm'}`;
  }
  return decision.kind;
};

const captureDecisionStream = (wasmEnabled: boolean): {
  readonly decisions: readonly NormalizedDecision[];
  readonly wasmRouteCount: number;
} => {
  policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(null);
  policyWasmRuntimeInternals.resetProductionScoreRowCounters();

  if (wasmEnabled) {
    policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(initializePolicyWasmRuntimeSync());
  }

  try {
    const def = getFitlProductionFixture().gameDef;
    const iterator = runGameSteps({
      def,
      seed: SEED,
      agents: createAgents(),
      maxTurns: MAX_TURNS,
      playerCount: PLAYER_COUNT,
      options: { skipDeltas: true },
      runtime: createGameDefRuntime(def),
    });
    const decisions: NormalizedDecision[] = [];
    while (decisions.length < TARGET_PLAYER_DECISIONS) {
      const next = iterator.next();
      if (next.done) {
        break;
      }
      if (next.value.kind === 'player') {
        decisions.push({
          decision: next.value.decisionLog.decision,
          candidates: normalizeCandidates(next.value.decisionLog.agentDecision),
        });
      }
    }

    return {
      decisions,
      wasmRouteCount: policyWasmRuntimeInternals.getProductionScoreRowRouteCount(),
    };
  } finally {
    policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(null);
    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
  }
};

describe('ARVN tournament WASM equivalence', () => {
  it('preserves the production FITL ARVN decision stream and candidate scores when WASM is enabled', { timeout: 60_000 }, () => {
    const wasmOff = captureDecisionStream(false);
    const wasmOn = captureDecisionStream(true);

    assert.ok(wasmOn.wasmRouteCount > 0, 'WASM-enabled run must exercise the production WASM score-row route');
    assert.equal(
      wasmOff.decisions.length,
      TARGET_PLAYER_DECISIONS,
      'production FITL ARVN run must publish the expected player-decision prefix',
    );
    assert.equal(
      wasmOn.decisions.length,
      wasmOff.decisions.length,
      'WASM and TypeScript runs must publish the same number of player decisions in the compared prefix',
    );
    for (let index = 0; index < wasmOff.decisions.length; index += 1) {
      assert.deepEqual(
        wasmOn.decisions[index],
        wasmOff.decisions[index],
        `decision ${index} diverged: WASM ${decisionSummary(wasmOn.decisions[index]?.decision)} vs TypeScript ${decisionSummary(wasmOff.decisions[index]?.decision)}`,
      );
    }
  });
});
