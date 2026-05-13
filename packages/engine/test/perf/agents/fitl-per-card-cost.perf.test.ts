// @test-class: architectural-invariant
//
// Spec 149 Phase 4 reset witness.
//
// The original <=250 ms same-seam target was retired on 2026-05-04 after the
// Spec 150 successor path proved that budget infeasible for the current
// architecture. The later Spec 168 optimization wave moved the authoritative
// measured budget to phase reports, so this older lane remains a CI-visible
// warning witness rather than a hard wall-clock assertion.

import * as assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { describe, it } from 'node:test';

import {
  getPolicyEncodedStateLayout,
  PolicyAgent,
  policyWasmProductionPreviewDriveInternals,
  precompilePolicyWasmScoreRows,
  __internal_for_tests as policyWasmRuntimeInternals,
} from '../../../src/agents/index.js';
import { initializePolicyWasmRuntimeSync } from '../../../src/agents/policy-wasm-runtime-node-loader.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  type Agent,
} from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/index.js';
import { getFitlBootstrapGameDefFixture } from '../../helpers/production-spec-helpers.js';

const FITL_BASELINE_PROFILES = [
  'us-baseline',
  'arvn-baseline',
  'nva-baseline',
  'vc-baseline',
] as const;

const WORKLOAD = {
  seed: 42,
  maxTurns: 1,
  playerCount: 4,
} as const;

const PHASE4_RESET_CEILING_MS = 1_800;

describe('Spec 149 Phase 4 FITL per-card reset witness', () => {
  it(`measures the one-card successor-runtime workload against the historical ${PHASE4_RESET_CEILING_MS} ms ceiling`, () => {
    initializePolicyWasmRuntimeSync();
    const def = assertValidatedGameDef(getFitlBootstrapGameDefFixture().gameDef);
    const runtime = createGameDefRuntime(def);
    precompileResetGateScoreRows(def);
    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
    policyWasmProductionPreviewDriveInternals.resetProductionPreviewDriveBatchCount();

    const elapsedMs = measure(def, runtime);

    assert.ok(
      Number.isFinite(elapsedMs) && elapsedMs > 0,
      `Expected positive elapsedMs, got ${elapsedMs}.`,
    );
    if (elapsedMs > PHASE4_RESET_CEILING_MS) {
      console.warn(
        `SPEC149_PHASE4_PER_CARD_RESET_WARNING elapsedMs=${round2(elapsedMs)} ` +
        `ceilingMs=${PHASE4_RESET_CEILING_MS} seed=${WORKLOAD.seed} ` +
        `maxTurns=${WORKLOAD.maxTurns} profiles=${FITL_BASELINE_PROFILES.join(',')} ` +
        `verifyIncrementalHash=true`,
      );
    }
    assert.equal(policyWasmRuntimeInternals.getProductionScoreRowUnsupportedCount(), 0);
    const previewCandidateFeatureRowUnsupportedCount =
      policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowUnsupportedCount();
    if (previewCandidateFeatureRowUnsupportedCount !== 0) {
      console.warn(
        `SPEC149_PHASE4_PREVIEW_CANDIDATE_FEATURE_ROW_UNSUPPORTED_WARNING ` +
        `unsupportedCount=${previewCandidateFeatureRowUnsupportedCount}`,
      );
    }
    assert.equal(policyWasmRuntimeInternals.getProductionScoreRowBytecodeCompileCount(), 0);
    const previewDriveBatchCount = policyWasmProductionPreviewDriveInternals.getProductionPreviewDriveBatchCount();
    assert.ok(
      previewDriveBatchCount > 0,
      `Expected production preview drive batches, got ${previewDriveBatchCount}.`,
    );
    if (previewDriveBatchCount !== 232) {
      console.warn(
        `SPEC149_PHASE4_PREVIEW_BATCH_COUNT_DRIFT ` +
        `previewDriveBatchCount=${previewDriveBatchCount} historicalBatchCount=232`,
      );
    }
  });
});

function precompileResetGateScoreRows(
  def: ReturnType<typeof assertValidatedGameDef>,
): void {
  assert.ok(def.agents !== undefined, 'FITL reset gate requires compiled agent catalog.');
  const layout = getPolicyEncodedStateLayout(def);
  for (const profileId of FITL_BASELINE_PROFILES) {
    precompilePolicyWasmScoreRows(def, layout, def.agents, profileId);
  }
}

function measure(
  def: ReturnType<typeof assertValidatedGameDef>,
  runtime: ReturnType<typeof createGameDefRuntime>,
): number {
  const agents: Agent[] = FITL_BASELINE_PROFILES.map(
    (profileId) => new PolicyAgent({ profileId, traceLevel: 'none' }),
  );

  const startedAt = performance.now();
  runGame(
    def,
    WORKLOAD.seed,
    agents,
    WORKLOAD.maxTurns,
    WORKLOAD.playerCount,
    {
      kernel: { verifyIncrementalHash: true },
      skipDeltas: true,
      traceRetention: 'finalStateOnly',
    },
    runtime,
  );
  return performance.now() - startedAt;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
