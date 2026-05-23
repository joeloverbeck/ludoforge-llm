// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { __internal_for_tests as policyWasmRuntimeInternals } from '../../src/agents/policy-wasm-runtime.js';
import { initializePolicyWasmRuntimeSync } from '../../src/agents/policy-wasm-runtime-node-loader.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  type AgentDecisionTrace,
  type CompiledAgentProfile,
  type Decision,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { runGameSteps } from '../../src/sim/index.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const SEED = 1000;
const PLAYER_COUNT = 4;
const MAX_TURNS = 20;
const TARGET_PLAYER_DECISIONS = 80;
// Spec 190 plan-primary root authority short-circuits `evaluatePolicyMove` on
// the plan-selected branch (`policy-agent.ts:617-625`). The production FITL
// baselines (`us-baseline`/`arvn-baseline`/`nva-baseline`/`vc-baseline`) are
// all plan-having per Spec 188, so the scalar evaluator's WASM score-row path
// is no longer reached for production action-selections on seed 1000. To keep
// this test exercising the WASM equivalence property it was built to guard,
// the seat profiles are dressed as planless control variants of the same
// baselines (`planTemplates: []`), forcing the fallback branch — where
// `evaluatePolicyMove` and its WASM score-row path execute — to fire on every
// action-selection. The WASM/TS equivalence property the test asserts is
// unchanged; only the corpus that exercises it shifts.
const PLAN_HAVING_BASELINES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const planlessProfileIdFor = (baseId: string): string => `${baseId}:spec-190-planless-control`;
const SEAT_PROFILES = PLAN_HAVING_BASELINES.map(planlessProfileIdFor);

const buildPlanlessControlDef = (def: ValidatedGameDef): ValidatedGameDef => {
  const baseAgents = def.agents;
  if (baseAgents === undefined) {
    throw new Error('Expected FITL production fixture to define agents');
  }
  const planlessProfiles: Record<string, CompiledAgentProfile> = {};
  for (const baseId of PLAN_HAVING_BASELINES) {
    const profile = baseAgents.profiles[baseId];
    if (profile === undefined) {
      throw new Error(`Expected FITL production fixture to define profile ${baseId}`);
    }
    planlessProfiles[planlessProfileIdFor(baseId)] = {
      ...profile,
      fingerprint: `${profile.fingerprint}:spec-190-planless-control`,
      plan: { ...profile.plan, planTemplates: [] },
    };
  }
  return assertValidatedGameDef({
    ...def,
    agents: {
      ...baseAgents,
      profiles: {
        ...baseAgents.profiles,
        ...planlessProfiles,
      },
    },
  });
};

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
  readonly wasmPreviewCandidateFeatureRowRouteCount: number;
  readonly wasmPreviewCandidateFeatureRowOracleFallbackCount: number;
} => {
  policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(null);
  policyWasmRuntimeInternals.resetProductionScoreRowCounters();

  if (wasmEnabled) {
    policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(initializePolicyWasmRuntimeSync());
  }

  try {
    const def = buildPlanlessControlDef(getFitlProductionFixture().gameDef);
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
      wasmPreviewCandidateFeatureRowRouteCount: policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowRouteCount(),
      wasmPreviewCandidateFeatureRowOracleFallbackCount: policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowOracleFallbackCount(),
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

  it('preserves decision 47 candidate scores when aggregate-fed preview rows use WASM materialization', { timeout: 60_000 }, () => {
    const wasmOff = captureDecisionStream(false);
    const wasmOn = captureDecisionStream(true);

    assert.ok(wasmOn.wasmRouteCount > 0, 'WASM-enabled run must exercise the production WASM score-row route');
    assert.ok(
      wasmOn.wasmPreviewCandidateFeatureRowRouteCount > 0,
      'WASM-enabled run must exercise preview candidate-feature row materialization',
    );
    assert.ok(
      wasmOn.wasmPreviewCandidateFeatureRowOracleFallbackCount > 0,
      'WASM-enabled run must expose row-local TS oracle fallbacks for non-ready aggregate-fed preview rows',
    );
    assert.deepEqual(
      wasmOn.decisions[47],
      wasmOff.decisions[47],
      `decision 47 diverged: WASM ${decisionSummary(wasmOn.decisions[47]?.decision)} vs TypeScript ${decisionSummary(wasmOff.decisions[47]?.decision)}`,
    );
  });
});
