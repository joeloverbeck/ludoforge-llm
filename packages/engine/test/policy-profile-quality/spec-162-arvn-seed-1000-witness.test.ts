// @test-class: convergence-witness
// @profile-variant: arvn-baseline

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { assertValidatedGameDef, createGameDefRuntime, type GameTrace } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/simulator.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const MAX_TURNS = 600;
const PLAYER_COUNT = 4;
const SEED = 33;
const PROFILE_ID = 'arvn-baseline';
const WITNESS_ID = 'spec-162-arvn-seed-33';
const REQUESTED_REF = 'preview.option.delta.victory.currentMargin.self';

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

function runWitnessTrace(): GameTrace {
  const { compiled } = compileProductionSpec();
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  const agents = createAgents((def.seats ?? []).map((seat) => seat.id));
  return runGame(def, SEED, agents, MAX_TURNS, PLAYER_COUNT, undefined, runtime);
}

function selectedCandidate(decision: TraceDecision) {
  const selectedKey = decision.agentDecision?.selectedStableMoveKey;
  return decision.agentDecision?.candidates?.find((candidate) => candidate.stableMoveKey === selectedKey);
}

function isSpec162DepthCapDecision(decision: TraceDecision): boolean {
  return decision.decisionContextKind === 'chooseNStep'
    && decision.agentDecision?.resolvedProfileId === PROFILE_ID
    && decision.agentDecision.previewUsage.refIds.includes(REQUESTED_REF)
    && (decision.agentDecision.previewUsage.outcomeBreakdown?.unknownDepthCap ?? 0) > 0;
}

describe(`${WITNESS_ID} convergence witness`, () => {
  it('keeps the ARVN seed deterministic and reports no-signal advisories when depth-capped decisions occur', { timeout: 60_000 }, () => {
    const firstTrace = runWitnessTrace();
    const secondTrace = runWitnessTrace();
    const affected = firstTrace.decisions.filter(isSpec162DepthCapDecision);
    const passed = affected.every((decision) => selectedCandidate(decision)?.selectionReason === 'tiebreakAfterPreviewNoSignal');

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: PROFILE_ID,
      seed: SEED,
      passed,
      stopReason: firstTrace.stopReason,
      decisions: firstTrace.decisions.length,
    });

    assert.equal(stringifyTrace(firstTrace), stringifyTrace(secondTrace), 'seed 33 replay must be byte-identical');
    assert.equal(firstTrace.stopReason, 'terminal');

    for (const decision of affected) {
      const agentDecision = decision.agentDecision;
      assert.ok(agentDecision, 'affected decisions must include policy trace metadata');
      assert.equal(agentDecision.previewUsage.coverage.allRootsUnavailable, true);
      assert.equal(agentDecision.previewUsage.coverage.selectedByTieBreakerBecausePreviewUnavailable, true);
      assert.deepEqual(agentDecision.previewUsage.refIds, [REQUESTED_REF]);

      const advisory = agentDecision.advisories?.find((entry) => entry.code === 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE');
      assert.ok(advisory, 'depth-capped chooseNStep decision must emit POLICY_PREVIEW_SIGNAL_UNAVAILABLE');
      assert.deepEqual(advisory.requestedRefs, [REQUESTED_REF]);
      assert.equal(advisory.selectionReason, 'tiebreakAfterPreviewNoSignal');
      assert.equal(advisory.decisionKind, 'chooseNStep');
      assert.equal(advisory.unavailabilityBreakdown.depthCap, agentDecision.previewUsage.outcomeBreakdown?.unknownDepthCap);

      const selected = selectedCandidate(decision);
      assert.ok(selected, 'affected decisions must trace the selected candidate');
      assert.equal(selected.selectionReason, 'tiebreakAfterPreviewNoSignal');
      assert.equal(
        selected.scoreContributions.some((entry) => entry.termId === 'preferOptionProjectedMargin'),
        false,
      );
    }
  });
});
