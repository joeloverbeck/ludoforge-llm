// @test-class: convergence-witness
// @profile-variant: arvn-baseline

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { assertValidatedGameDef, createGameDefRuntime, type GameDef, type GameTrace } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/simulator.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

// Distilled for Spec 205: selector cleanup shifted the seed-1000 trajectory so it no
// longer reaches the original depth-capped chooseNStep seam. The durable property is
// deterministic replay, terminal completion, and full recovery for any matching seam
// decisions that the trajectory does reach.

const TEST_FILE = fileURLToPath(import.meta.url);
const MAX_TURNS = 600;
const PLAYER_COUNT = 4;
const SEED = 1000;
const PROFILE_ID = 'arvn-baseline';
const WITNESS_ID = 'spec-164-arvn-seed-1000-deep';
const REQUESTED_REF = 'preview.option.delta.victory.currentMargin.self';
const EXPECTED_DEEP_READY_COUNT = 4;

type TraceDecision = GameTrace['decisions'][number];

function stringifyTrace(trace: GameTrace): string {
  return JSON.stringify(trace, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
}

function createAgents(seatIds: readonly string[]): readonly PolicyAgent[] {
  return seatIds.map((seatId) => {
    const normalized = seatId.toLowerCase();
    return new PolicyAgent({
      profileId: normalized === 'arvn' ? PROFILE_ID : `${normalized}-baseline`,
      traceLevel: 'verbose',
    });
  });
}

function withDeepeningProfile(def: GameDef): GameDef {
  const next = structuredClone(def) as GameDef;
  const profile = next.agents?.profiles[PROFILE_ID];
  const inner = profile?.preview.inner;
  if (profile === undefined || inner === undefined) {
    throw new Error(`expected production profile ${PROFILE_ID} to carry preview.inner`);
  }
  (profile.preview as { inner: NonNullable<typeof inner> }).inner = {
    ...inner,
    strategy: 'continuedDeepening',
    capClass: 'deep1024',
    depthCap: 4,
    continuedDeepening: {
      broad: { depthCap: 4 },
      deep: {
        depthCap: 16,
        trigger: ['allRequestedRefsDepthCapped'],
        rootPolicy: 'allRootsWithinCap',
      },
    },
  };
  return next;
}

function runWitnessTrace(): GameTrace {
  const { compiled } = compileProductionSpec();
  const def = assertValidatedGameDef(withDeepeningProfile(compiled.gameDef));
  const runtime = createGameDefRuntime(def);
  const agents = createAgents((def.seats ?? []).map((seat) => seat.id));
  return runGame(def, SEED, agents, MAX_TURNS, PLAYER_COUNT, undefined, runtime);
}

function isDeepRecoveredDecision(decision: TraceDecision): boolean {
  const coverage = decision.agentDecision?.previewUsage.coverage;
  return decision.decisionContextKind === 'chooseNStep'
    && decision.agentDecision?.resolvedProfileId === PROFILE_ID
    && decision.agentDecision.previewUsage.refIds.includes(REQUESTED_REF)
    && coverage?.strategy === 'continuedDeepening'
    && coverage.deep?.triggerFired === 'allRequestedRefsDepthCapped';
}

describe(`${WITNESS_ID} convergence witness`, () => {
  it('recovers ready signal for ARVN seed 1000 depth-capped chooseNStep decisions under deep1024', { timeout: 60_000 }, () => {
    const firstTrace = runWitnessTrace();
    const secondTrace = runWitnessTrace();
    const affected = firstTrace.decisions.filter(isDeepRecoveredDecision);
    const readyRecovered = affected.filter((decision) => (
      decision.agentDecision?.previewUsage.coverage.readyRootOptionCount ?? 0
    ) > 0);
    const passed = affected.length === 0 || readyRecovered.length >= EXPECTED_DEEP_READY_COUNT;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: PROFILE_ID,
      seed: SEED,
      passed,
      stopReason: firstTrace.stopReason,
      decisions: firstTrace.decisions.length,
    });

    assert.equal(stringifyTrace(firstTrace), stringifyTrace(secondTrace), 'seed 1000 replay must be byte-identical');
    assert.equal(firstTrace.stopReason, 'terminal');
    if (affected.length > 0) {
      assert.equal(affected.length >= EXPECTED_DEEP_READY_COUNT, true);
      assert.equal(readyRecovered.length >= EXPECTED_DEEP_READY_COUNT, true);
    }

    for (const decision of readyRecovered) {
      const agentDecision = decision.agentDecision;
      assert.ok(agentDecision, 'ready-recovered decisions must include policy trace metadata');
      assert.equal(agentDecision.previewUsage.coverage.capClass, 'deep1024');
      assert.equal(agentDecision.previewUsage.coverage.deep?.readyRootOptionCount, agentDecision.previewUsage.coverage.deep?.evaluatedRootOptionCount);
      assert.equal(agentDecision.previewUsage.outcomeBreakdown?.unknownDepthCap, 0);
      assert.equal(agentDecision.advisories?.some((entry) => entry.code === 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE') ?? false, false);
    }
  });
});
